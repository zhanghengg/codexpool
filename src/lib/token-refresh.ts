import { prisma } from "./db";

const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

export async function ensureFreshToken(accountId: string): Promise<string | null> {
  const account = await prisma.upstreamAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) return null;

  const now = new Date();
  const expiryThreshold = new Date(now.getTime() + TOKEN_REFRESH_BUFFER_MS);

  if (account.tokenExpiry > expiryThreshold) {
    return account.accessToken;
  }

  try {
    const response = await fetch(OPENAI_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: account.refreshToken,
      }),
    });

    if (!response.ok) {
      console.error(`[token-refresh] Failed for ${account.email}: ${response.status}`);
      await prisma.upstreamAccount.update({
        where: { id: accountId },
        data: { isHealthy: false },
      });
      return null;
    }

    const data: TokenResponse = await response.json();
    const newExpiry = new Date(now.getTime() + data.expires_in * 1000);

    await prisma.upstreamAccount.update({
      where: { id: accountId },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || account.refreshToken,
        idToken: data.id_token || account.idToken,
        tokenExpiry: newExpiry,
        lastRefresh: now,
        isHealthy: true,
        errorCount: 0,
      },
    });

    return data.access_token;
  } catch (err) {
    console.error(`[token-refresh] Error for ${account.email}:`, err);
    return account.accessToken;
  }
}
