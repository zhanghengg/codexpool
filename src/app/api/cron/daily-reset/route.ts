import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfDay } from "date-fns";
import { refreshAllExpiringSoon } from "@/lib/token-refresh";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStart = startOfDay(new Date());

  const result = await prisma.subscription.updateMany({
    where: {
      isActive: true,
      dailyResetAt: { lt: todayStart },
    },
    data: {
      dailyRequestsUsed: 0,
      dailyTokensUsed: 0,
      dailyCostUsed: 0,
      dailyResetAt: todayStart,
    },
  });

  await prisma.subscription.updateMany({
    where: {
      isActive: true,
      expireAt: { lt: new Date() },
    },
    data: { isActive: false },
  });

  await prisma.upstreamAccount.updateMany({
    where: { isHealthy: false, errorCount: { lt: 5 } },
    data: { isHealthy: true, errorCount: 0 },
  });

  const tokenRefreshResult = await refreshAllExpiringSoon();

  return NextResponse.json({
    message: "Daily reset complete",
    subscriptionsReset: result.count,
    tokenRefresh: tokenRefreshResult,
  });
}
