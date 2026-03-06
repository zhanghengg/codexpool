import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const updateUpstreamSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  weight: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  tokenJson: z.string().optional(),
});

const patchUpstreamSchema = z.object({
  action: z.enum(["toggleActive", "resetHealth"]),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateUpstreamSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const upstream = await prisma.upstreamAccount.findUnique({ where: { id } });
    if (!upstream) {
      return NextResponse.json({ error: "Upstream not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.baseUrl !== undefined) updateData.baseUrl = parsed.data.baseUrl;
    if (parsed.data.weight !== undefined) updateData.weight = parsed.data.weight;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

    if (parsed.data.tokenJson) {
      try {
        const tokenData = JSON.parse(parsed.data.tokenJson);
        updateData.accessToken = tokenData.access_token;
        updateData.refreshToken = tokenData.refresh_token;
        if (tokenData.id_token) updateData.idToken = tokenData.id_token;
        if (tokenData.expired) updateData.tokenExpiry = new Date(tokenData.expired);
        if (tokenData.email) updateData.email = tokenData.email;
        if (tokenData.account_id) updateData.accountId = tokenData.account_id;
        updateData.isHealthy = true;
        updateData.errorCount = 0;
      } catch {
        return NextResponse.json({ error: "Invalid token JSON" }, { status: 400 });
      }
    }

    const updated = await prisma.upstreamAccount.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      ...updated,
      accessToken: undefined,
      refreshToken: undefined,
      idToken: undefined,
    });
  } catch (error) {
    console.error("[admin/upstream/[id] PUT]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json();
    const parsed = patchUpstreamSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const upstream = await prisma.upstreamAccount.findUnique({ where: { id } });
    if (!upstream) {
      return NextResponse.json({ error: "Upstream not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.action === "toggleActive") {
      data.isActive = !upstream.isActive;
    } else if (parsed.data.action === "resetHealth") {
      data.isHealthy = true;
      data.errorCount = 0;
    }

    const updated = await prisma.upstreamAccount.update({ where: { id }, data });
    return NextResponse.json({
      ...updated,
      accessToken: undefined,
      refreshToken: undefined,
      idToken: undefined,
    });
  } catch (error) {
    console.error("[admin/upstream/[id] PATCH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const upstream = await prisma.upstreamAccount.findUnique({ where: { id } });
    if (!upstream) {
      return NextResponse.json({ error: "Upstream not found" }, { status: 404 });
    }

    await prisma.upstreamAccount.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/upstream/[id] DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
