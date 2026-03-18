import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeSubscriptions,
      todayUsage,
      todayCostAgg,
      upstreamAccounts,
      recentErrors,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { isActive: true } }),
      prisma.usageLog.aggregate({
        where: { createdAt: { gte: today } },
        _count: true,
        _sum: { totalTokens: true },
      }),
      prisma.usageLog.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { cost: true },
      }),
      prisma.upstreamAccount.findMany({
        select: { isActive: true, isHealthy: true },
      }),
      prisma.usageLog.findMany({
        where: { errorMessage: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          userId: true,
          endpoint: true,
          errorMessage: true,
          statusCode: true,
          createdAt: true,
        },
      }),
    ]);

    const todayCost = todayCostAgg._sum.cost ?? 0;

    const upstreamHealth = {
      total: upstreamAccounts.length,
      active: upstreamAccounts.filter((a) => a.isActive).length,
      healthy: upstreamAccounts.filter((a) => a.isActive && a.isHealthy).length,
    };

    return NextResponse.json({
      totalUsers,
      activeSubscriptions,
      todayRequests: todayUsage._count,
      todayTokens: todayUsage._sum.totalTokens ?? 0,
      todayCost,
      upstreamHealth,
      recentErrors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
