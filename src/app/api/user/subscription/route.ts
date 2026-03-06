import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    });
  }

  const { plan } = subscription;
  const dailyRequestPercentage =
    plan.dailyRequestLimit > 0
      ? Math.min(
          100,
          (subscription.dailyRequestsUsed / plan.dailyRequestLimit) * 100
        )
      : 0;
  const dailyTokenPercentage =
    plan.dailyTokenLimit > 0
      ? Math.min(
          100,
          (subscription.dailyTokensUsed / plan.dailyTokenLimit) * 100
        )
      : 0;
  const totalTokenPercentage =
    plan.totalTokenLimit > 0
      ? Math.min(
          100,
          (subscription.totalTokensUsed / plan.totalTokenLimit) * 100
        )
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
      totalTokenLimit: plan.totalTokenLimit,
      rpm: plan.rpm,
      allowedModels: plan.allowedModels,
    },
    usage: {
      dailyRequestsUsed: subscription.dailyRequestsUsed,
      dailyTokensUsed: subscription.dailyTokensUsed,
      totalTokensUsed: subscription.totalTokensUsed,
    },
    percentageUsed: {
      dailyRequests: dailyRequestPercentage,
      dailyTokens: dailyTokenPercentage,
      totalTokens: totalTokenPercentage,
    },
  });
}
