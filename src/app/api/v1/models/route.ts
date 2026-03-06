import { authenticateApiKey } from "@/lib/api-auth";
import { checkQuota } from "@/lib/quota";

const DEFAULT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
];

export async function GET(request: Request) {
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

  const quota = await checkQuota(auth.userId);
  const allowedModels =
    quota.plan?.allowedModels && quota.plan.allowedModels.length > 0
      ? quota.plan.allowedModels
      : DEFAULT_MODELS;

  const models = allowedModels.map((id) => ({
    id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "codexpool",
  }));

  return new Response(
    JSON.stringify({ object: "list", data: models }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
