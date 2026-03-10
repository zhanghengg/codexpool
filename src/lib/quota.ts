import { prisma } from "./db";
import { estimateCost } from "./pricing";
import { startOfDay } from "date-fns";

interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  subscriptionId?: string;
  plan?: {
    id: string;
    name: string;
    rpm: number;
    allowedModels: string[];
  };
}

const QUOTA_CACHE_TTL_MS = 5_000;
const quotaCache = new Map<string, { result: QuotaCheckResult; expiresAt: number }>();

export async function checkQuota(
  userId: string,
  model?: string
): Promise<QuotaCheckResult> {
  const cacheKey = `${userId}:${model || "*"}`;
  const cached = quotaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId, isActive: true },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return { allowed: false, reason: "No active subscription" };
  }

  const now = new Date();
  if (now > subscription.expireAt) {
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { isActive: false },
    }).catch(() => {});
    return { allowed: false, reason: "Subscription expired" };
  }

  const todayStart = startOfDay(now);
  if (subscription.dailyResetAt < todayStart) {
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        dailyRequestsUsed: 0,
        dailyTokensUsed: 0,
        dailyCostUsed: 0,
        dailyResetAt: todayStart,
      },
    }).catch(() => {});
    subscription.dailyRequestsUsed = 0;
    subscription.dailyTokensUsed = 0;
    subscription.dailyCostUsed = 0;
  }

  if (
    subscription.plan.dailyRequestLimit > 0 &&
    subscription.dailyRequestsUsed >= subscription.plan.dailyRequestLimit
  ) {
    return { allowed: false, reason: "Daily request limit reached" };
  }

  if (
    subscription.plan.dailyTokenLimit > 0 &&
    subscription.dailyTokensUsed >= subscription.plan.dailyTokenLimit
  ) {
    return { allowed: false, reason: "Daily token limit reached" };
  }

  if (
    subscription.plan.dailyCostLimit > 0 &&
    subscription.dailyCostUsed >= subscription.plan.dailyCostLimit
  ) {
    return { allowed: false, reason: "Daily cost limit reached" };
  }

  if (
    subscription.plan.totalTokenLimit > 0 &&
    subscription.totalTokensUsed >= subscription.plan.totalTokenLimit
  ) {
    return { allowed: false, reason: "Total token limit reached" };
  }

  if (
    model &&
    subscription.plan.allowedModels.length > 0 &&
    !subscription.plan.allowedModels.includes(model)
  ) {
    return {
      allowed: false,
      reason: `Model '${model}' not allowed on your plan`,
    };
  }

  const result: QuotaCheckResult = {
    allowed: true,
    subscriptionId: subscription.id,
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      rpm: subscription.plan.rpm,
      allowedModels: subscription.plan.allowedModels,
    },
  };

  quotaCache.set(cacheKey, { result, expiresAt: Date.now() + QUOTA_CACHE_TTL_MS });
  return result;
}

export async function consumeQuota(
  subscriptionId: string,
  totalTokens: number
) {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      dailyRequestsUsed: { increment: 1 },
      dailyTokensUsed: { increment: totalTokens },
      totalTokensUsed: { increment: totalTokens },
    },
  });
}

export async function incrementRequestCount(subscriptionId: string) {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { dailyRequestsUsed: { increment: 1 } },
  });
}

/**
 * @deprecated Use addUsage instead for accurate cost tracking.
 */
export async function addTokenUsage(
  subscriptionId: string,
  tokens: number
) {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      dailyTokensUsed: { increment: tokens },
      totalTokensUsed: { increment: tokens },
    },
  });
}

export async function addUsage(
  subscriptionId: string,
  promptTokens: number,
  completionTokens: number,
  model?: string | null,
) {
  const totalTokens = promptTokens + completionTokens;
  const cost = estimateCost(promptTokens, completionTokens, model);
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      dailyTokensUsed: { increment: totalTokens },
      totalTokensUsed: { increment: totalTokens },
      dailyCostUsed: { increment: cost },
    },
  });
}
