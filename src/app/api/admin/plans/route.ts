import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  durationDays: z.number().int().positive(),
  dailyRequestLimit: z.number().int().min(0),
  dailyTokenLimit: z.number().int().min(0),
  totalTokenLimit: z.number().int().min(0),
  rpm: z.number().int().min(0).default(10),
  allowedModels: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const plans = await prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: plans });
  } catch (error) {
    console.error("[admin/plans GET]", error);
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
    const parsed = createPlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const plan = await prisma.plan.create({
      data: parsed.data,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    console.error("[admin/plans POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
