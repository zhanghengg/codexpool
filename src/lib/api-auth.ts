import { prisma } from "./db";

interface ApiKeyAuth {
  userId: string;
  apiKeyId: string;
  email: string;
  isBlocked: boolean;
}

const AUTH_CACHE_TTL_MS = 30_000;
const authCache = new Map<string, { data: ApiKeyAuth; expiresAt: number }>();

export async function authenticateApiKey(
  authHeader: string | null
): Promise<ApiKeyAuth | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7);
  if (!key) return null;

  const cached = authCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
    include: { user: { select: { id: true, email: true, isBlocked: true } } },
  });

  if (!apiKey || !apiKey.isActive) {
    authCache.delete(key);
    return null;
  }

  const result: ApiKeyAuth = {
    userId: apiKey.user.id,
    apiKeyId: apiKey.id,
    email: apiKey.user.email,
    isBlocked: apiKey.user.isBlocked,
  };

  authCache.set(key, { data: result, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  return result;
}

export function invalidateAuthCache(key?: string) {
  if (key) authCache.delete(key);
  else authCache.clear();
}
