import { authenticateApiKey } from "@/lib/api-auth";
import { checkQuota, incrementRequestCount } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limiter";
import { proxyResponsesRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  const [auth, rawBody] = await Promise.all([
    authenticateApiKey(authHeader),
    request.text(),
  ]);

  if (!auth) {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid API key", type: "authentication_error" },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (auth.isBlocked) {
    return new Response(
      JSON.stringify({
        error: { message: "Account is blocked", type: "authentication_error" },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid request body", type: "invalid_request_error" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const model = parsedBody.model as string | undefined;

  const quota = await checkQuota(auth.userId, model);
  if (!quota.allowed) {
    return new Response(
      JSON.stringify({
        error: { message: quota.reason, type: "insufficient_quota" },
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const rateCheck = checkRateLimit(
    `rpm:${auth.userId}`,
    quota.plan!.rpm,
    60_000
  );
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Rate limit exceeded. Please slow down.",
          type: "rate_limit_error",
        },
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(
            Math.ceil((rateCheck.resetAt - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  incrementRequestCount(quota.subscriptionId!).catch(() => {});

  return proxyResponsesRequest(parsedBody, {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    subscriptionId: quota.subscriptionId!,
    endpoint: "/v1/responses",
    model,
  });
}
