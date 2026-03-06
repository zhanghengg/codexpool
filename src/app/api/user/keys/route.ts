import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { nanoid } from "nanoid";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const MAX_KEYS_PER_USER = 5;

const createKeySchema = z.object({
  name: z.string().min(1).max(100).default("Default"),
});

function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  return key.slice(0, 7) + "..." + key.slice(-4);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      key: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const masked = keys.map((k) => ({
    id: k.id,
    key: maskKey(k.key),
    name: k.name,
    isActive: k.isActive,
    createdAt: k.createdAt,
  }));

  return NextResponse.json(masked);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name } = createKeySchema.parse(body);

    const count = await prisma.apiKey.count({
      where: { userId: session.user.id },
    });

    if (count >= MAX_KEYS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum ${MAX_KEYS_PER_USER} API keys allowed per user` },
        { status: 400 }
      );
    }

    const rawKey = "sk-" + nanoid(48);
    const apiKey = await prisma.apiKey.create({
      data: {
        key: rawKey,
        name,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      id: apiKey.id,
      key: rawKey,
      name: apiKey.name,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
    });
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
