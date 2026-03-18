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

/**
 * Reads subscription + plan, validates expiry / daily reset / model access,
 * and performs an early (non-atomic) limit check for fast rejection.
 *
 * The authoritative limit enforcement happens in `consumeRequestSlot`,
 * which uses a conditional UPDATE to guarantee atomicity.
 */
export async function checkQuota(
  userId: string,
  model?: string
): Promise<QuotaCheckResult> {
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
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { isActive: false },
    });
    return { allowed: false, reason: "Subscription expired" };
  }

  const todayStart = startOfDay(now);
  if (subscription.dailyResetAt < todayStart) {
    await prisma.subscription.updateMany({
      where: {
        id: subscription.id,
        dailyResetAt: { lt: todayStart },
      },
      data: {
        dailyRequestsUsed: 0,
        dailyTokensUsed: 0,
        dailyCostUsed: 0,
        dailyResetAt: todayStart,
      },
    });
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

  return {
    allowed: true,
    subscriptionId: subscription.id,
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      rpm: subscription.plan.rpm,
      allowedModels: subscription.plan.allowedModels,
    },
  };
}

/**
 * Atomically increments `dailyRequestsUsed` only when ALL plan limits
 * (daily requests, daily tokens, daily cost, total tokens) are still
 * within bounds. Returns `true` if the slot was consumed, `false` if
 * any limit has been reached.
 *
 * Uses a conditional UPDATE with a JOIN against the Plan table so the
 * check-and-increment is a single atomic SQL statement — no TOCTOU gap.
 */
export async function consumeRequestSlot(subscriptionId: string): Promise<boolean> {
  const rowsAffected: number = await prisma.$executeRaw`
    UPDATE "Subscription" s
    SET "dailyRequestsUsed" = s."dailyRequestsUsed" + 1
    FROM "Plan" p
    WHERE s."id" = ${subscriptionId}
      AND s."planId" = p."id"
      AND s."isActive" = true
      AND (p."dailyRequestLimit" = 0 OR s."dailyRequestsUsed" < p."dailyRequestLimit")
      AND (p."dailyTokenLimit" = 0 OR s."dailyTokensUsed" < p."dailyTokenLimit")
      AND (p."dailyCostLimit" = 0 OR s."dailyCostUsed" < p."dailyCostLimit")
      AND (p."totalTokenLimit" = 0 OR s."totalTokensUsed" < p."totalTokenLimit")
  `;
  return rowsAffected > 0;
}

export async function addUsage(
  subscriptionId: string,
  promptTokens: number,
  completionTokens: number,
  model?: string | null,
) {
  const totalTokens = promptTokens + completionTokens;
  const cost = estimateCost(promptTokens, completionTokens, model);
  try {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        dailyTokensUsed: { increment: totalTokens },
        totalTokensUsed: { increment: totalTokens },
        dailyCostUsed: { increment: cost },
      },
    });
  } catch (err) {
    console.error("[addUsage] Failed to update subscription usage:", err);
  }
}
