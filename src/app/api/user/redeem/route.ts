import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { addDays } from "date-fns";

const redeemSchema = z.object({
  code: z.string().min(1).max(100),
});

class RedeemError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "RedeemError";
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const body = await request.json();
    const { code } = redeemSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const redeemCode = await tx.redeemCode.findUnique({
        where: { code: code.trim().toUpperCase() },
        include: { plan: true },
      });

      if (!redeemCode) {
        throw new RedeemError(404, "Invalid or expired code");
      }

      if (redeemCode.usedCount >= redeemCode.maxUses) {
        throw new RedeemError(400, "Code has reached maximum uses");
      }

      if (redeemCode.expireAt && redeemCode.expireAt < new Date()) {
        throw new RedeemError(400, "Code has expired");
      }

      const now = new Date();
      const expireAt = addDays(now, redeemCode.plan.durationDays);

      await tx.subscription.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      const subscription = await tx.subscription.create({
        data: {
          userId,
          planId: redeemCode.planId,
          startAt: now,
          expireAt,
        },
        include: { plan: true },
      });

      await tx.redeemCode.update({
        where: { id: redeemCode.id },
        data: { usedCount: { increment: 1 } },
      });

      await tx.redeemLog.create({
        data: {
          userId,
          codeId: redeemCode.id,
        },
      });

      return subscription;
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: result.id,
        planId: result.planId,
        planName: result.plan.name,
        startAt: result.startAt,
        expireAt: result.expireAt,
      },
    });
  } catch (err) {
    if (err instanceof RedeemError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
