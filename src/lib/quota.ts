import { prisma } from "./db";
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
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        dailyRequestsUsed: 0,
        dailyTokensUsed: 0,
        dailyResetAt: todayStart,
      },
    });
    subscription.dailyRequestsUsed = 0;
    subscription.dailyTokensUsed = 0;
  }

  if (subscription.dailyRequestsUsed >= subscription.plan.dailyRequestLimit) {
    return { allowed: false, reason: "Daily request limit reached" };
  }

  if (subscription.dailyTokensUsed >= subscription.plan.dailyTokenLimit) {
    return { allowed: false, reason: "Daily token limit reached" };
  }

  if (subscription.totalTokensUsed >= subscription.plan.totalTokenLimit) {
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
