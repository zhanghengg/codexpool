import {
  selectUpstream,
  selectUpstreamExcluding,
  reportUpstreamError,
  reportUpstreamSuccess,
  type UpstreamInfo,
} from "./load-balancer";
import { prisma } from "./db";
import { addUsage } from "./quota";
import {
  convertChatRequestToCodex,
  convertCodexResponseToChat,
  createCodexStreamTransformer,
} from "./codex-adapter";

const MODEL_DOWNGRADE_MAP: Record<string, string> = {
  "gpt-5.3-codex": "gpt-5.2-codex",
  "gpt-5.4": "gpt-5.2",
};

function mapModelForUpstream(model: string): string {
  return MODEL_DOWNGRADE_MAP[model] ?? model;
}

const MAX_RETRIES = 2;
const CODEX_ENDPOINT = "/responses";
const CODEX_USER_AGENT = "codex_cli_rs/0.112.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464";
const CODEX_VERSION = "0.112.0";

function randomSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes]
    .map((b, i) => {
      const hex = b.toString(16).padStart(2, "0");
      return [4, 6, 8, 10].includes(i) ? `-${hex}` : hex;
    })
    .join("");
}

interface ProxyContext {
  userId: string;
  apiKeyId: string;
  subscriptionId: string;
  endpoint: string;
  model?: string;
}

export async function proxyRequest(
  request: Request,
  ctx: ProxyContext
): Promise<Response> {
  const rawBody = await request.text();
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "Invalid request body", type: "invalid_request_error" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { codexBody, isStream } = convertChatRequestToCodex(parsedBody);
  const model = (parsedBody.model as string) || "gpt-5.3-codex";

  const triedIds: string[] = [];
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const upstream =
      attempt === 0
        ? await selectUpstream()
        : await selectUpstreamExcluding(triedIds);

    if (!upstream) {
      return new Response(
        JSON.stringify({
          error: {
            message: lastError
              ? `All upstream accounts failed: ${lastError}`
              : "No available upstream accounts",
            type: "server_error",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    triedIds.push(upstream.id);
    const startTime = Date.now();

    try {
      const upstreamUrl = `${upstream.baseUrl}${CODEX_ENDPOINT}`;
      const upstreamResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${upstream.accessToken}`,
          "User-Agent": CODEX_USER_AGENT,
          "Openai-Beta": "responses=experimental",
          Version: CODEX_VERSION,
          Originator: "codex_cli_rs",
          Session_id: randomSessionId(),
          "Chatgpt-Account-Id": upstream.accountId,
          Connection: "Keep-Alive",
        },
        body: codexBody,
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();
        await reportUpstreamError(upstream.id);
        lastError = errorText;

        logUsage(ctx, upstream, startTime, upstreamResponse.status, errorText).catch(() => {});

        if (upstreamResponse.status === 429 || upstreamResponse.status >= 500) {
          continue;
        }

        return new Response(
          JSON.stringify({
            error: { message: `Upstream error: ${upstreamResponse.status}`, type: "server_error" },
          }),
          { status: upstreamResponse.status, headers: { "Content-Type": "application/json" } }
        );
      }

      reportUpstreamSuccess(upstream.id).catch(() => {});

      if (isStream) {
        return handleStreamResponse(upstreamResponse, ctx, upstream, startTime, model);
      }

      // Codex backend always streams; collect full SSE and convert to JSON for non-stream requests
      return collectStreamToJson(upstreamResponse, ctx, upstream, startTime, model);
    } catch (err) {
      await reportUpstreamError(upstream.id);
      lastError = err instanceof Error ? err.message : "Unknown error";
      logUsage(ctx, upstream, startTime, 500, lastError).catch(() => {});
      continue;
    }
  }

  return new Response(
    JSON.stringify({
      error: {
        message: `All upstream accounts failed: ${lastError}`,
        type: "server_error",
      },
    }),
    { status: 502, headers: { "Content-Type": "application/json" } }
  );
}

function handleStreamResponse(
  upstreamResponse: Response,
  ctx: ProxyContext,
  upstream: UpstreamInfo,
  startTime: number,
  model: string
): Response {
  const upstreamBody = upstreamResponse.body;
  if (!upstreamBody) {
    return new Response(
      JSON.stringify({ error: { message: "No response body" } }),
      { status: 502 }
    );
  }

  const transformer = createCodexStreamTransformer(model, (usage) => {
    addUsage(ctx.subscriptionId, usage.promptTokens, usage.completionTokens, model).catch(() => {});
    logUsage(ctx, upstream, startTime, 200, null, usage).catch(() => {});
  });
  const stream = upstreamBody.pipeThrough(transformer);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function collectStreamToJson(
  upstreamResponse: Response,
  ctx: ProxyContext,
  upstream: UpstreamInfo,
  startTime: number,
  model: string
): Promise<Response> {
  const sseText = await upstreamResponse.text();

  let contentText = "";
  let responseId = "chatcmpl-codexpool";
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

  for (const line of sseText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") break;

    let event: Record<string, unknown>;
    try { event = JSON.parse(payload); } catch { continue; }

    const eventType = event.type as string | undefined;

    if (eventType === "response.output_text.delta") {
      contentText += (event.delta as string) || "";
      continue;
    }
    if (eventType === "response.output_item.done") {
      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === "function_call") {
        toolCalls.push({
          id: (item.call_id as string) || (item.id as string) || `call_${toolCalls.length}`,
          name: (item.name as string) || "unknown",
          arguments: extractFnArgs(item),
        });
      }
      continue;
    }
    if (eventType === "response.completed" || eventType === "response.done") {
      const resp = event.response as Record<string, unknown> | undefined;
      if (resp) {
        responseId = (resp.id as string) || responseId;
        const u = resp.usage as Record<string, number> | undefined;
        if (u) {
          inputTokens = u.input_tokens || u.prompt_tokens || 0;
          outputTokens = u.output_tokens || u.completion_tokens || 0;
        }
        if (!contentText && resp.output_text && typeof resp.output_text === "string") {
          contentText = resp.output_text;
        }
      }
    }
  }

  const message: Record<string, unknown> = { role: "assistant", content: contentText || null };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments },
    }));
  }

  const totalTokens = inputTokens + outputTokens;
  addUsage(ctx.subscriptionId, inputTokens, outputTokens, model).catch(() => {});
  logUsage(ctx, upstream, startTime, 200, null, {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
  }).catch(() => {});

  const openaiResponse = {
    id: responseId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
    },
  };

  return new Response(JSON.stringify(openaiResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Responses API: pass-through proxy ─────────────────────────────

export async function proxyResponsesRequest(
  request: Request,
  ctx: ProxyContext
): Promise<Response> {
  const rawBody = await request.text();
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "Invalid request body", type: "invalid_request_error" } }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const userWantsStream = parsedBody.stream !== false;
  const rawModel = (parsedBody.model as string) || "gpt-5.3-codex";
  const model = mapModelForUpstream(rawModel);

  const upstreamBody: Record<string, unknown> = {
    ...parsedBody,
    model,
    stream: true,
    store: parsedBody.store ?? false,
  };
  if (!upstreamBody.reasoning) {
    upstreamBody.reasoning = { effort: "medium" };
  }
  if (upstreamBody.include === undefined) {
    upstreamBody.include = ["reasoning.encrypted_content"];
  }

  if (rawModel !== model) {
    const text = upstreamBody.text as Record<string, unknown> | undefined;
    if (text && "verbosity" in text) {
      delete text.verbosity;
    }
  }

  const codexBody = JSON.stringify(upstreamBody);

  const triedIds: string[] = [];
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const upstream =
      attempt === 0
        ? await selectUpstream()
        : await selectUpstreamExcluding(triedIds);

    if (!upstream) {
      return new Response(
        JSON.stringify({
          error: {
            message: lastError
              ? `All upstream accounts failed: ${lastError}`
              : "No available upstream accounts",
            type: "server_error",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    triedIds.push(upstream.id);
    const startTime = Date.now();

    try {
      const upstreamUrl = `${upstream.baseUrl}${CODEX_ENDPOINT}`;
      const upstreamResponse = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${upstream.accessToken}`,
          "User-Agent": CODEX_USER_AGENT,
          "Openai-Beta": "responses=experimental",
          Version: CODEX_VERSION,
          Originator: "codex_cli_rs",
          Session_id: randomSessionId(),
          "Chatgpt-Account-Id": upstream.accountId,
          Connection: "Keep-Alive",
        },
        body: codexBody,
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();
        await reportUpstreamError(upstream.id);
        lastError = errorText;

        logUsage(ctx, upstream, startTime, upstreamResponse.status, errorText).catch(() => {});

        if (upstreamResponse.status === 429 || upstreamResponse.status >= 500) {
          continue;
        }

        return new Response(
          JSON.stringify({
            error: { message: `Upstream error: ${upstreamResponse.status}`, type: "server_error" },
          }),
          { status: upstreamResponse.status, headers: { "Content-Type": "application/json" } }
        );
      }

      reportUpstreamSuccess(upstream.id).catch(() => {});

      if (userWantsStream) {
        return handleResponsesStreamPassthrough(upstreamResponse, ctx, upstream, startTime);
      }

      return collectResponsesToJson(upstreamResponse, ctx, upstream, startTime);
    } catch (err) {
      await reportUpstreamError(upstream.id);
      lastError = err instanceof Error ? err.message : "Unknown error";
      logUsage(ctx, upstream, startTime, 500, lastError).catch(() => {});
      continue;
    }
  }

  return new Response(
    JSON.stringify({
      error: {
        message: `All upstream accounts failed: ${lastError}`,
        type: "server_error",
      },
    }),
    { status: 502, headers: { "Content-Type": "application/json" } }
  );
}

function handleResponsesStreamPassthrough(
  upstreamResponse: Response,
  ctx: ProxyContext,
  upstream: UpstreamInfo,
  startTime: number
): Response {
  const upstreamBody = upstreamResponse.body;
  if (!upstreamBody) {
    return new Response(
      JSON.stringify({ error: { message: "No response body" } }),
      { status: 502 }
    );
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        controller.enqueue(encoder.encode(line + "\n"));

        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload) as Record<string, unknown>;
          const eventType = event.type as string | undefined;
          if (eventType === "response.completed" || eventType === "response.done") {
            const resp = event.response as Record<string, unknown> | undefined;
            const usage = resp?.usage as Record<string, number> | undefined;
            if (usage) {
              const input = usage.input_tokens || 0;
              const output = usage.output_tokens || 0;
              const total = input + output;
              addUsage(ctx.subscriptionId, input, output, ctx.model).catch(() => {});
              logUsage(ctx, upstream, startTime, 200, null, {
                promptTokens: input,
                completionTokens: output,
                totalTokens: total,
              }).catch(() => {});
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    },
    flush(controller) {
      if (buffer) {
        controller.enqueue(encoder.encode(buffer));
      }
    },
  });

  const stream = upstreamBody.pipeThrough(transformer);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function collectResponsesToJson(
  upstreamResponse: Response,
  ctx: ProxyContext,
  upstream: UpstreamInfo,
  startTime: number
): Promise<Response> {
  const sseText = await upstreamResponse.text();

  let finalResponse: Record<string, unknown> | null = null;

  for (const line of sseText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") break;

    try {
      const event = JSON.parse(payload) as Record<string, unknown>;
      const eventType = event.type as string | undefined;
      if (eventType === "response.completed" || eventType === "response.done") {
        const resp = event.response as Record<string, unknown> | undefined;
        if (resp) finalResponse = resp;
      }
    } catch {
      continue;
    }
  }

  if (!finalResponse) {
    return new Response(
      JSON.stringify({ error: { message: "No completed response from upstream", type: "server_error" } }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const usage = finalResponse.usage as Record<string, number> | undefined;
  const promptTokens = usage?.input_tokens || 0;
  const completionTokens = usage?.output_tokens || 0;
  const totalTokens = promptTokens + completionTokens;
  addUsage(ctx.subscriptionId, promptTokens, completionTokens, ctx.model).catch(() => {});
  logUsage(ctx, upstream, startTime, 200, null, {
    promptTokens,
    completionTokens,
    totalTokens,
  }).catch(() => {});

  return new Response(JSON.stringify(finalResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Shared helpers ────────────────────────────────────────────────

function extractFnArgs(item: Record<string, unknown>): string {
  for (const key of ["arguments", "input", "arguments_json"]) {
    const val = item[key];
    if (val === undefined || val === null) continue;
    if (typeof val === "string") return val;
    try { return JSON.stringify(val); } catch { continue; }
  }
  return "{}";
}

interface TokenDetail {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

async function logUsage(
  ctx: ProxyContext,
  upstream: UpstreamInfo,
  startTime: number,
  statusCode: number,
  errorMessage: string | null,
  tokens?: TokenDetail | number
) {
  try {
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    if (typeof tokens === "number") {
      totalTokens = tokens;
    } else if (tokens) {
      promptTokens = tokens.promptTokens;
      completionTokens = tokens.completionTokens;
      totalTokens = tokens.totalTokens;
    }

    await prisma.usageLog.create({
      data: {
        userId: ctx.userId,
        apiKeyId: ctx.apiKeyId,
        upstreamId: upstream.id,
        model: ctx.model,
        endpoint: ctx.endpoint,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs: Date.now() - startTime,
        statusCode,
        errorMessage,
      },
    });
  } catch {
    // non-critical
  }
}
