/**
 * Protocol adapter: converts between OpenAI chat/completions format
 * and Codex /responses format used by free accounts via ChatGPT backend.
 *
 * Upstream: https://chatgpt.com/backend-api/codex/v1/responses
 */

// ─── Model downgrade for free-tier upstream accounts ───────────────

const MODEL_DOWNGRADE_MAP: Record<string, string> = {
  "gpt-5.3-codex": "gpt-5.2-codex",
  "gpt-5.4": "gpt-5.2",
};

export function mapModelForUpstream(model: string): string {
  return MODEL_DOWNGRADE_MAP[model] ?? model;
}

// ─── Request conversion: OpenAI → Codex ────────────────────────────

interface OpenAIChatMessage {
  role: string;
  content?: string | Array<{ type: string; text?: string }>;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

function extractContentText(
  content: string | Array<{ type: string; text?: string }> | undefined
): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("");
  }
  return "";
}

function convertToolChoice(choice: unknown): unknown {
  if (typeof choice === "string") return choice;
  if (typeof choice === "object" && choice !== null) {
    const obj = choice as Record<string, unknown>;
    if (obj.type === "function" && obj.function) {
      const fn = obj.function as Record<string, unknown>;
      return { type: "function", name: fn.name };
    }
  }
  return choice;
}

function convertMessagesToCodexInput(messages: OpenAIChatMessage[]): {
  instructions: string;
  input: unknown[];
} {
  let instructions = "";
  const input: unknown[] = [];

  for (const msg of messages) {
    if (msg.role === "system" || msg.role === "developer") {
      const text = extractContentText(msg.content);
      if (text) {
        instructions = instructions ? `${instructions}\n${text}` : text;
      }
      continue;
    }

    if (msg.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id || "",
        output: extractContentText(msg.content),
      });
    } else if (msg.role === "assistant") {
      const text = extractContentText(msg.content);
      if (text) {
        input.push({ role: "assistant", content: text });
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
      }
    } else {
      const item: Record<string, unknown> = { role: "user" };
      const text = extractContentText(msg.content);
      if (text) item.content = text;
      input.push(item);
    }
  }

  return { instructions, input };
}

export function convertChatRequestToCodex(body: Record<string, unknown>): {
  codexBody: string;
  isStream: boolean;
} {
  const messages = (body.messages as OpenAIChatMessage[]) || [];
  const { instructions, input } = convertMessagesToCodexInput(messages);
  const userWantsStream = body.stream === true;

  const rawModel = (body.model as string) || "gpt-5.3-codex";
  const model = mapModelForUpstream(rawModel);

  const codexRequest: Record<string, unknown> = {
    model,
    instructions,
    input,
    stream: true, // Codex backend requires stream=true
    store: false,
    reasoning: {
      effort: (body as Record<string, unknown>).reasoning_effort || "medium",
    },
    parallel_tool_calls:
      body.parallel_tool_calls !== undefined ? body.parallel_tool_calls : true,
    include: ["reasoning.encrypted_content"],
  };

  if (body.tools) {
    const tools = body.tools as Array<Record<string, unknown>>;
    codexRequest.tools = tools.map((tool) => {
      if (tool.type === "function" && tool.function) {
        const fn = tool.function as Record<string, unknown>;
        return {
          type: "function",
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
          ...(fn.strict !== undefined ? { strict: fn.strict } : {}),
        };
      }
      return tool;
    });
  }

  if (body.tool_choice !== undefined) {
    codexRequest.tool_choice = convertToolChoice(body.tool_choice);
  }

  if (body.service_tier) {
    codexRequest.service_tier = body.service_tier;
  }

  return { codexBody: JSON.stringify(codexRequest), isStream: userWantsStream };
}

// ─── Response conversion: Codex → OpenAI (non-streaming) ──────────

export function convertCodexResponseToChat(codexData: Record<string, unknown>): string {
  const id = (codexData.id as string) || "chatcmpl-codexpool";
  const model = (codexData.model as string) || "gpt-5.3-codex";

  let contentText = "";
  const toolCalls: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> = [];

  if (codexData.output_text && typeof codexData.output_text === "string") {
    contentText = codexData.output_text;
  }

  const outputItems = codexData.output as Array<Record<string, unknown>> | undefined;
  if (outputItems && Array.isArray(outputItems)) {
    for (const item of outputItems) {
      if (item.type === "message") {
        const contents = item.content as Array<Record<string, unknown>> | undefined;
        if (contents) {
          for (const block of contents) {
            if (
              (block.type === "output_text" || block.type === "text") &&
              typeof block.text === "string"
            ) {
              if (!contentText) contentText = block.text;
            }
          }
        }
      } else if (item.type === "function_call") {
        const callId = (item.call_id as string) || (item.id as string) || `call_${toolCalls.length}`;
        const name = item.name as string;
        const args = extractFunctionArguments(item);
        if (name) {
          toolCalls.push({
            id: callId,
            type: "function",
            function: { name, arguments: args },
          });
        }
      }
    }
  }

  const usage = codexData.usage as Record<string, number> | undefined;
  const promptTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;

  const message: Record<string, unknown> = {
    role: "assistant",
    content: contentText || null,
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const finishReason = toolCalls.length > 0 ? "tool_calls" : "stop";

  const response = {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };

  return JSON.stringify(response);
}

// ─── SSE streaming conversion: Codex → OpenAI ─────────────────────

export function createCodexStreamTransformer(
  model: string,
  onComplete?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }) => void
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let responseId = "chatcmpl-codexpool";
  let buffer = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalized = false;
  const pendingToolCalls: Map<number, {
    id: string;
    name: string;
    arguments: string;
  }> = new Map();

  function finalizeStream(
    controller: TransformStreamDefaultController<Uint8Array>
  ) {
    if (finalized) return;
    finalized = true;

    flushToolCalls(controller, encoder, responseId, model);

    const usage = {
      prompt_tokens: totalInputTokens,
      completion_tokens: totalOutputTokens,
      total_tokens: totalInputTokens + totalOutputTokens,
    };

    onComplete?.({
      promptTokens: totalInputTokens,
      completionTokens: totalOutputTokens,
      totalTokens: usage.total_tokens,
    });

    const doneChunk = formatOpenAIDelta(
      responseId,
      model,
      {},
      "stop",
      usage
    );
    controller.enqueue(encoder.encode(`data: ${doneChunk}\n\n`));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  }

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          finalizeStream(controller);
          return;
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        const eventType = event.type as string | undefined;

        if (eventType === "response.output_text.delta") {
          const delta = event.delta as string;
          if (delta) {
            const chunk = formatOpenAIDelta(responseId, model, { content: delta });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          }
          continue;
        }

        if (eventType === "response.function_call_arguments.delta") {
          const idx = (event.output_index as number) ?? pendingToolCalls.size;
          const entry = pendingToolCalls.get(idx);
          if (entry) {
            entry.arguments += (event.delta as string) || "";
          }
          continue;
        }

        if (eventType === "response.output_item.added") {
          const item = event.item as Record<string, unknown> | undefined;
          if (item?.type === "function_call") {
            const idx = (event.output_index as number) ?? pendingToolCalls.size;
            pendingToolCalls.set(idx, {
              id: (item.call_id as string) || (item.id as string) || `call_${idx}`,
              name: (item.name as string) || "unknown",
              arguments: "",
            });
          }
          continue;
        }

        if (eventType === "response.output_item.done") {
          const item = event.item as Record<string, unknown> | undefined;
          if (item?.type === "function_call") {
            const idx = (event.output_index as number) ?? pendingToolCalls.size;
            const existing = pendingToolCalls.get(idx);
            if (existing) {
              const args = extractFunctionArguments(item);
              if (args) existing.arguments = args;
            } else {
              pendingToolCalls.set(idx, {
                id: (item.call_id as string) || (item.id as string) || `call_${idx}`,
                name: (item.name as string) || "unknown",
                arguments: extractFunctionArguments(item),
              });
            }
          }
          continue;
        }

        if (eventType === "response.completed" || eventType === "response.done") {
          const resp = event.response as Record<string, unknown> | undefined;
          if (resp) {
            responseId = (resp.id as string) || responseId;
            const usage = resp.usage as Record<string, number> | undefined;
            if (usage) {
              totalInputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
              totalOutputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
            }
          }
          continue;
        }

        if (eventType === "response.created") {
          const resp = event.response as Record<string, unknown> | undefined;
          if (resp?.id) responseId = resp.id as string;
          continue;
        }
      }
    },

    flush(controller) {
      finalizeStream(controller);
    },
  });

  function flushToolCalls(
    controller: TransformStreamDefaultController<Uint8Array>,
    enc: TextEncoder,
    id: string,
    mdl: string
  ) {
    if (pendingToolCalls.size === 0) return;
    const calls = Array.from(pendingToolCalls.entries())
      .sort(([a], [b]) => a - b)
      .map(([index, tc]) => ({
        index,
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));

    const chunk = formatOpenAIDelta(id, mdl, { tool_calls: calls }, "tool_calls");
    controller.enqueue(enc.encode(`data: ${chunk}\n\n`));
    pendingToolCalls.clear();
  }
}

function formatOpenAIDelta(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finishReason?: string | null,
  usage?: Record<string, number>
): string {
  const obj: Record<string, unknown> = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason || null,
      },
    ],
  };
  if (usage) obj.usage = usage;
  return JSON.stringify(obj);
}

function extractFunctionArguments(item: Record<string, unknown>): string {
  for (const key of ["arguments", "input", "arguments_json", "parsed_arguments", "args"]) {
    const val = item[key];
    if (val === undefined || val === null) continue;
    if (typeof val === "string") return val;
    try {
      return JSON.stringify(val);
    } catch {
      continue;
    }
  }
  return "{}";
}
