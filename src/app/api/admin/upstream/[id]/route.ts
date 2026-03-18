import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureFreshToken } from "@/lib/token-refresh";
import { invalidateUpstreamCache } from "@/lib/load-balancer";
import { z } from "zod";

const updateUpstreamSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  weight: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  tokenJson: z.string().optional(),
});

const patchUpstreamSchema = z.object({
  action: z.enum(["toggleActive", "resetHealth", "checkHealth"]),
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

    if (parsed.data.action === "checkHealth") {
      return handleCheckHealth(upstream);
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.action === "toggleActive") {
      data.isActive = !upstream.isActive;
    } else if (parsed.data.action === "resetHealth") {
      data.isHealthy = true;
      data.errorCount = 0;
    }

    const updated = await prisma.upstreamAccount.update({ where: { id }, data });
    invalidateUpstreamCache();
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

const CODEX_USER_AGENT = "codex_cli_rs/0.112.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464";

async function handleCheckHealth(upstream: {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  tokenExpiry: Date;
  baseUrl: string;
  accountId: string;
}) {
  const freshToken = await ensureFreshToken(upstream);
  if (!freshToken) {
    await prisma.upstreamAccount.update({
      where: { id: upstream.id },
      data: { isHealthy: false, isActive: false },
    });
    invalidateUpstreamCache();
    return NextResponse.json({
      checkStatus: "banned",
      message: "Token 刷新失败，账号可能已被封禁，已自动停用",
    });
  }

  try {
    const testBody = JSON.stringify({
      model: "gpt-5.2",
      instructions: "Reply with OK",
      input: [{ role: "user", content: "hi" }],
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      include: ["reasoning.encrypted_content"],
    });

    const resp = await fetch(`${upstream.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${freshToken}`,
        "User-Agent": CODEX_USER_AGENT,
        "Openai-Beta": "responses=experimental",
        Version: "0.112.0",
        Originator: "codex_cli_rs",
        Session_id: crypto.randomUUID(),
        "Chatgpt-Account-Id": upstream.accountId,
        Connection: "Keep-Alive",
      },
      body: testBody,
      signal: AbortSignal.timeout(15_000),
    });

    if (resp.ok) {
      await resp.text();
      await prisma.upstreamAccount.update({
        where: { id: upstream.id },
        data: { isHealthy: true, errorCount: 0 },
      });
      invalidateUpstreamCache();
      return NextResponse.json({
        checkStatus: "ok",
        message: "账号正常",
      });
    }

    const errorText = await resp.text().catch(() => "");

    if (resp.status === 401 || resp.status === 403) {
      await prisma.upstreamAccount.update({
        where: { id: upstream.id },
        data: { isHealthy: false, isActive: false, errorCount: 5 },
      });
      invalidateUpstreamCache();
      return NextResponse.json({
        checkStatus: "banned",
        message: `账号已被封禁 (HTTP ${resp.status})，已自动停用`,
      });
    }

    return NextResponse.json({
      checkStatus: "error",
      message: `上游返回异常 (HTTP ${resp.status}): ${errorText.slice(0, 200)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({
      checkStatus: "error",
      message: `请求失败: ${message}`,
    });
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
