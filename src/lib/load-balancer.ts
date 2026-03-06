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

let roundRobinIndex = 0;

export async function selectUpstream(): Promise<UpstreamInfo | null> {
  const accounts = await prisma.upstreamAccount.findMany({
    where: { isActive: true, isHealthy: true },
    orderBy: { weight: "desc" },
  });

  if (accounts.length === 0) return null;

  const weighted: typeof accounts = [];
  for (const a of accounts) {
    for (let i = 0; i < a.weight; i++) {
      weighted.push(a);
    }
  }

  roundRobinIndex = (roundRobinIndex + 1) % weighted.length;
  const selected = weighted[roundRobinIndex];

  const freshToken = await ensureFreshToken(selected.id);
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
  const accounts = await prisma.upstreamAccount.findMany({
    where: {
      isActive: true,
      isHealthy: true,
      id: { notIn: excludeIds },
    },
    orderBy: { weight: "desc" },
  });

  if (accounts.length === 0) return null;

  const idx = Math.floor(Math.random() * accounts.length);
  const selected = accounts[idx];

  const freshToken = await ensureFreshToken(selected.id);
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
  }
}

export async function reportUpstreamSuccess(upstreamId: string) {
  await prisma.upstreamAccount.update({
    where: { id: upstreamId },
    data: { errorCount: 0, isHealthy: true, totalUsed: { increment: 1 } },
  });
}
