import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { estimateCostSmart } from "@/lib/pricing";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id, isActive: true },
    include: {
      plan: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return NextResponse.json({
      subscription: null,
      usage: null,
      percentageUsed: null,
      cost: null,
    });
  }

    const costLogs = await prisma.usageLog.findMany({
      where: { userId: session.user.id, createdAt: { gte: subscription.startAt } },
      select: { promptTokens: true, completionTokens: true, totalTokens: true, cost: true, model: true },
    });
    const totalCost = costLogs.reduce((sum, l) => {
      const c = l.cost > 0
        ? l.cost
        : estimateCostSmart(l.promptTokens, l.completionTokens, l.totalTokens, l.model);
      return sum + c;
    }, 0);

  const { plan } = subscription;
  const dailyRequestPercentage =
    plan.dailyRequestLimit > 0
      ? Math.min(100, (subscription.dailyRequestsUsed / plan.dailyRequestLimit) * 100)
      : 0;
  const dailyTokenPercentage =
    plan.dailyTokenLimit > 0
      ? Math.min(100, (subscription.dailyTokensUsed / plan.dailyTokenLimit) * 100)
      : 0;
  const dailyCostPercentage =
    plan.dailyCostLimit > 0
      ? Math.min(100, (subscription.dailyCostUsed / plan.dailyCostLimit) * 100)
      : 0;
  const totalTokenPercentage =
    plan.totalTokenLimit > 0
      ? Math.min(100, (subscription.totalTokensUsed / plan.totalTokenLimit) * 100)
      : 0;

  return NextResponse.json({
    subscription: {
      id: subscription.id,
      planId: subscription.planId,
      startAt: subscription.startAt,
      expireAt: subscription.expireAt,
      dailyResetAt: subscription.dailyResetAt,
      isActive: subscription.isActive,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      durationDays: plan.durationDays,
      dailyRequestLimit: plan.dailyRequestLimit,
      dailyTokenLimit: plan.dailyTokenLimit,
      dailyCostLimit: plan.dailyCostLimit,
      totalTokenLimit: plan.totalTokenLimit,
      rpm: plan.rpm,
      allowedModels: plan.allowedModels,
    },
    usage: {
      dailyRequestsUsed: subscription.dailyRequestsUsed,
      dailyTokensUsed: subscription.dailyTokensUsed,
      dailyCostUsed: subscription.dailyCostUsed,
      totalTokensUsed: subscription.totalTokensUsed,
    },
    percentageUsed: {
      dailyRequests: dailyRequestPercentage,
      dailyTokens: dailyTokenPercentage,
      dailyCost: dailyCostPercentage,
      totalTokens: totalTokenPercentage,
    },
    cost: {
      dailyCost: subscription.dailyCostUsed,
      totalCost,
    },
  });
}
