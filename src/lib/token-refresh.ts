import { prisma } from "./db";
import { invalidateUpstreamCache } from "./load-balancer";

const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

export interface UpstreamAccountData {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  tokenExpiry: Date;
}

const pendingRefreshes = new Set<string>();

export async function ensureFreshToken(account: UpstreamAccountData): Promise<string | null> {
  const now = new Date();

  // Token still valid — return immediately
  if (account.tokenExpiry > now) {
    const bufferThreshold = new Date(now.getTime() + TOKEN_REFRESH_BUFFER_MS);
    if (account.tokenExpiry <= bufferThreshold && !pendingRefreshes.has(account.id)) {
      // Near expiry: trigger non-blocking background refresh
      pendingRefreshes.add(account.id);
      doRefresh(account).finally(() => pendingRefreshes.delete(account.id));
    }
    return account.accessToken;
  }

  // Token expired — must refresh synchronously
  return doRefresh(account);
}

async function doRefresh(account: UpstreamAccountData): Promise<string | null> {
  try {
    const now = new Date();
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
        where: { id: account.id },
        data: { isHealthy: false },
      });
      invalidateUpstreamCache();
      return null;
    }

    const data: TokenResponse = await response.json();
    const newExpiry = new Date(now.getTime() + data.expires_in * 1000);

    await prisma.upstreamAccount.update({
      where: { id: account.id },
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

    // Update in-memory account data so subsequent uses within cache TTL see fresh token
    account.accessToken = data.access_token;
    account.tokenExpiry = newExpiry;

    return data.access_token;
  } catch (err) {
    console.error(`[token-refresh] Error for ${account.email}:`, err);
    return account.accessToken;
  }
}

export async function ensureFreshTokenById(accountId: string): Promise<string | null> {
  const account = await prisma.upstreamAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) return null;
  return ensureFreshToken(account);
}

const PROACTIVE_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function refreshAllExpiringSoon(): Promise<{
  refreshed: number;
  failed: number;
}> {
  const threshold = new Date(Date.now() + PROACTIVE_REFRESH_WINDOW_MS);

  const accounts = await prisma.upstreamAccount.findMany({
    where: { tokenExpiry: { lt: threshold } },
    select: { id: true, email: true },
  });

  let refreshed = 0;
  let failed = 0;

  for (const account of accounts) {
    const result = await ensureFreshTokenById(account.id);
    if (result) {
      refreshed++;
    } else {
      failed++;
      console.error(`[token-refresh] Proactive refresh failed for ${account.email}`);
    }
  }

  console.log(
    `[token-refresh] Proactive refresh complete: ${refreshed} refreshed, ${failed} failed out of ${accounts.length}`
  );

  return { refreshed, failed };
}
