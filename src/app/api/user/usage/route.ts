import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { startOfDay, subDays } from "date-fns";

const querySchema = z.object({
  days: z.coerce.number().min(1).max(90).default(7),
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    days: searchParams.get("days") ?? 7,
  });

  const days = parsed.success ? parsed.data.days : 7;

  const startDate = startOfDay(subDays(new Date(), days));

  const logs = await prisma.usageLog.findMany({
    where: {
      userId: session.user.id,
      createdAt: { gte: startDate },
    },
    select: {
      createdAt: true,
      totalTokens: true,
    },
  });

  const byDay = new Map<
    string,
    { date: string; requestCount: number; tokenUsage: number }
  >();

  for (let i = 0; i < days; i++) {
    const d = subDays(new Date(), days - 1 - i);
    const dateStr = startOfDay(d).toISOString().split("T")[0];
    byDay.set(dateStr, {
      date: dateStr,
      requestCount: 0,
      tokenUsage: 0,
    });
  }

  for (const log of logs) {
    const dateStr = startOfDay(log.createdAt).toISOString().split("T")[0];
    const entry = byDay.get(dateStr);
    if (entry) {
      entry.requestCount += 1;
      entry.tokenUsage += log.totalTokens;
    } else {
      byDay.set(dateStr, {
        date: dateStr,
        requestCount: 1,
        tokenUsage: log.totalTokens,
      });
    }
  }

  const stats = Array.from(byDay.values()).sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  return NextResponse.json({
    days,
    stats,
    totalRequests: stats.reduce((sum, s) => sum + s.requestCount, 0),
    totalTokens: stats.reduce((sum, s) => sum + s.tokenUsage, 0),
  });
}
