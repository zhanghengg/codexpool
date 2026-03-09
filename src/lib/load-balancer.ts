import { prisma } from "./db";
import { ensureFreshToken } from "./token-refresh";

export interface UpstreamInfo {
  id: string;
  name: string;
  accessToken: string;
  accountId: string;
  baseUrl: string;
  weight: number;
}

type UpstreamRow = Awaited<ReturnType<typeof prisma.upstreamAccount.findMany>>[number];

const CACHE_TTL_MS = 10_000;
let cachedAccounts: UpstreamRow[] = [];
let cacheTimestamp = 0;

async function getHealthyAccounts(): Promise<UpstreamRow[]> {
  const now = Date.now();
  if (cachedAccounts.length > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedAccounts;
  }
  cachedAccounts = await prisma.upstreamAccount.findMany({
    where: { isActive: true, isHealthy: true },
    orderBy: { weight: "desc" },
  });
  cacheTimestamp = now;
  return cachedAccounts;
}

export function invalidateUpstreamCache() {
  cacheTimestamp = 0;
}

let roundRobinIndex = 0;

export async function selectUpstream(): Promise<UpstreamInfo | null> {
  const accounts = await getHealthyAccounts();
  if (accounts.length === 0) return null;

  const weighted: UpstreamRow[] = [];
  for (const a of accounts) {
    for (let i = 0; i < a.weight; i++) {
      weighted.push(a);
    }
  }

  roundRobinIndex = (roundRobinIndex + 1) % weighted.length;
  const selected = weighted[roundRobinIndex];

  const freshToken = await ensureFreshToken(selected);
  if (!freshToken) return null;

  return {
    id: selected.id,
    name: selected.name,
    accessToken: freshToken,
    accountId: selected.accountId,
    baseUrl: selected.baseUrl,
    weight: selected.weight,
  };
}

export async function selectUpstreamExcluding(
  excludeIds: string[]
): Promise<UpstreamInfo | null> {
  const accounts = await getHealthyAccounts();
  const filtered = accounts.filter((a) => !excludeIds.includes(a.id));
  if (filtered.length === 0) return null;

  const idx = Math.floor(Math.random() * filtered.length);
  const selected = filtered[idx];

  const freshToken = await ensureFreshToken(selected);
  if (!freshToken) return null;

  return {
    id: selected.id,
    name: selected.name,
    accessToken: freshToken,
    accountId: selected.accountId,
    baseUrl: selected.baseUrl,
    weight: selected.weight,
  };
}

const CIRCUIT_BREAKER_THRESHOLD = 5;

export async function reportUpstreamError(upstreamId: string) {
  const account = await prisma.upstreamAccount.update({
    where: { id: upstreamId },
    data: { errorCount: { increment: 1 } },
  });

  if (account.errorCount >= CIRCUIT_BREAKER_THRESHOLD) {
    await prisma.upstreamAccount.update({
      where: { id: upstreamId },
      data: { isHealthy: false },
    });
    invalidateUpstreamCache();
  }
}

export async function reportUpstreamSuccess(upstreamId: string) {
  await prisma.upstreamAccount.update({
    where: { id: upstreamId },
    data: { errorCount: 0, isHealthy: true, totalUsed: { increment: 1 } },
  });
}
