import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
    });

    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return NextResponse.json(map);
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = updateSettingSchema.parse(body);

    const setting = await prisma.systemSetting.upsert({
      where: { key: parsed.key },
      create: { key: parsed.key, value: parsed.value },
      update: { value: parsed.value },
    });

    return NextResponse.json(setting);
  } catch (err) {
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
