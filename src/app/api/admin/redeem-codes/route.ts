import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { customAlphabet } from "nanoid";
import { z } from "zod";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateCode = customAlphabet(ALPHABET, 12);
const generateBatchId = customAlphabet(ALPHABET, 8);

function formatCode(raw: string): string {
  return `CX-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

const batchGenerateSchema = z.object({
  planId: z.string().min(1),
  count: z.number().int().min(1).max(100),
  expireDays: z.number().int().min(0).optional(),
  maxUses: z.number().int().min(1).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const batchId = searchParams.get("batchId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Record<string, unknown> = {};

    if (batchId) {
      where.batchId = batchId;
    }

    if (status === "used") {
      const all = await prisma.redeemCode.findMany({
        where: { ...where },
        include: { plan: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      const filtered = all.filter((c) => c.usedCount >= c.maxUses);
      const total = filtered.length;
      const data = filtered.slice(skip, skip + limit).map((c) => ({
        ...c,
        status: "used" as const,
      }));
      return NextResponse.json({
        data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    if (status === "unused") {
      const all = await prisma.redeemCode.findMany({
        where: { ...where },
        include: { plan: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      const filtered = all.filter(
        (c) =>
          c.usedCount < c.maxUses &&
          (!c.expireAt || c.expireAt > now)
      );
      const total = filtered.length;
      const data = filtered.slice(skip, skip + limit).map((c) => ({
        ...c,
        status: "unused" as const,
      }));
      return NextResponse.json({
        data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    if (status === "expired") {
      where.expireAt = { not: null, lte: now };
    }

    const [codes, total] = await Promise.all([
      prisma.redeemCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { plan: { select: { name: true } } },
      }),
      prisma.redeemCode.count({ where }),
    ]);

    const data = codes.map((c) => ({
      ...c,
      status:
        c.usedCount >= c.maxUses
          ? ("used" as const)
          : c.expireAt && c.expireAt <= now
            ? ("expired" as const)
            : ("available" as const),
    }));

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[admin/redeem-codes GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const parsed = batchGenerateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const plan = await prisma.plan.findUnique({
      where: { id: parsed.data.planId },
    });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const batchId = generateBatchId();
    const expireAt = parsed.data.expireDays
      ? new Date(Date.now() + parsed.data.expireDays * 24 * 60 * 60 * 1000)
      : null;
    const maxUses = parsed.data.maxUses ?? 1;

    const existingCodes = new Set(
      (await prisma.redeemCode.findMany({ select: { code: true } })).map(
        (c) => c.code
      )
    );

    const toCreate: {
      code: string;
      planId: string;
      batchId: string;
      maxUses: number;
      expireAt: Date | null;
    }[] = [];
    let attempts = 0;
    const maxAttempts = parsed.data.count * 20;

    while (toCreate.length < parsed.data.count && attempts < maxAttempts) {
      attempts++;
      const raw = generateCode();
      const code = formatCode(raw);
      if (!existingCodes.has(code)) {
        existingCodes.add(code);
        toCreate.push({ code, planId: parsed.data.planId, batchId, maxUses, expireAt });
      }
    }

    if (toCreate.length < parsed.data.count) {
      return NextResponse.json(
        { error: "Failed to generate unique codes" },
        { status: 500 }
      );
    }

    await prisma.redeemCode.createMany({ data: toCreate });

    return NextResponse.json({
      batchId,
      codes: toCreate.map((c) => c.code),
      count: toCreate.length,
    });
  } catch (error) {
    console.error("[admin/redeem-codes POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
