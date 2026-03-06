import { authenticateApiKey } from "@/lib/api-auth";
import { checkQuota, incrementRequestCount } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limiter";
import { proxyRequest } from "@/lib/proxy";

export async function POST(request: Request) {
  const auth = await authenticateApiKey(
    request.headers.get("authorization")
  );

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

  let model: string | undefined;
  try {
    const cloned = request.clone();
    const body = await cloned.json();
    model = body.model;
  } catch {
    // ignore
  }

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
          message: "Rate limit exceeded",
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

  await incrementRequestCount(quota.subscriptionId!);

  return proxyRequest(request, {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    subscriptionId: quota.subscriptionId!,
    endpoint: "/v1/embeddings",
    model,
  });
}
