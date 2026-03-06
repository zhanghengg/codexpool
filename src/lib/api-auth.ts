import { prisma } from "./db";

interface ApiKeyAuth {
  userId: string;
  apiKeyId: string;
  email: string;
  isBlocked: boolean;
}

export async function authenticateApiKey(
  authHeader: string | null
): Promise<ApiKeyAuth | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7);
  if (!key) return null;

  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
    include: { user: { select: { id: true, email: true, isBlocked: true } } },
  });

  if (!apiKey || !apiKey.isActive) return null;

  return {
    userId: apiKey.user.id,
    apiKeyId: apiKey.id,
    email: apiKey.user.email,
    isBlocked: apiKey.user.isBlocked,
  };
}
