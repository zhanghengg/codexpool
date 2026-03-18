import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const codexTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().optional(),
  account_id: z.string().min(1),
  email: z.string().min(1),
  expired: z.string().min(1),
  last_refresh: z.string().optional(),
  type: z.string().optional(),
});

const createUpstreamSchema = z.object({
  tokenJson: z.string().min(1),
  name: z.string().optional(),
  weight: z.number().int().min(0).default(1),
  baseUrl: z.string().url().default("https://chatgpt.com/backend-api/codex"),
});

const batchImportSchema = z.object({
  tokens: z.array(codexTokenSchema).min(1),
  weight: z.number().int().min(0).default(1),
  baseUrl: z.string().url().default("https://chatgpt.com/backend-api/codex"),
});

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const upstreams = await prisma.upstreamAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        accountId: true,
        tokenExpiry: true,
        lastRefresh: true,
        baseUrl: true,
        weight: true,
        isActive: true,
        isHealthy: true,
        errorCount: true,
        totalUsed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ data: upstreams });
  } catch (error) {
    console.error("[admin/upstream GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const parsed = batchDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await prisma.upstreamAccount.deleteMany({
      where: { id: { in: parsed.data.ids } },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("[admin/upstream DELETE]", error);
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

    if (body.tokens && Array.isArray(body.tokens)) {
      const parsed = batchImportSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.issues;
        const summary = issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return NextResponse.json(
          { error: `输入校验失败: ${summary}`, details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const results = [];
      for (const token of parsed.data.tokens) {
        const existing = await prisma.upstreamAccount.findFirst({
          where: { accountId: token.account_id },
        });

        if (existing) {
          const updated = await prisma.upstreamAccount.update({
            where: { id: existing.id },
            data: {
              accessToken: token.access_token,
              refreshToken: token.refresh_token,
              idToken: token.id_token,
              tokenExpiry: new Date(token.expired),
              lastRefresh: token.last_refresh
                ? new Date(token.last_refresh)
                : null,
              isHealthy: true,
              errorCount: 0,
            },
          });
          results.push({ email: token.email, action: "updated", id: updated.id });
        } else {
          const created = await prisma.upstreamAccount.create({
            data: {
              name: token.email.split("@")[0],
              email: token.email,
              accountId: token.account_id,
              accessToken: token.access_token,
              refreshToken: token.refresh_token,
              idToken: token.id_token,
              tokenExpiry: new Date(token.expired),
              lastRefresh: token.last_refresh
                ? new Date(token.last_refresh)
                : null,
              weight: parsed.data.weight,
              baseUrl: parsed.data.baseUrl,
            },
          });
          results.push({ email: token.email, action: "created", id: created.id });
        }
      }

      return NextResponse.json({ results, count: results.length }, { status: 201 });
    }

    const parsed = createUpstreamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let tokenData;
    try {
      tokenData = codexTokenSchema.parse(JSON.parse(parsed.data.tokenJson));
    } catch {
      return NextResponse.json(
        { error: "Invalid token JSON format" },
        { status: 400 }
      );
    }

    const existing = await prisma.upstreamAccount.findFirst({
      where: { accountId: tokenData.account_id },
    });

    if (existing) {
      const updated = await prisma.upstreamAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          idToken: tokenData.id_token,
          tokenExpiry: new Date(tokenData.expired),
          lastRefresh: tokenData.last_refresh
            ? new Date(tokenData.last_refresh)
            : null,
          isHealthy: true,
          errorCount: 0,
        },
      });
      return NextResponse.json(
        { ...updated, accessToken: undefined, refreshToken: undefined, idToken: undefined },
        { status: 200 }
      );
    }

    const upstream = await prisma.upstreamAccount.create({
      data: {
        name: parsed.data.name || tokenData.email.split("@")[0],
        email: tokenData.email,
        accountId: tokenData.account_id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        idToken: tokenData.id_token,
        tokenExpiry: new Date(tokenData.expired),
        lastRefresh: tokenData.last_refresh
          ? new Date(tokenData.last_refresh)
          : null,
        weight: parsed.data.weight,
        baseUrl: parsed.data.baseUrl,
      },
    });

    return NextResponse.json(
      { ...upstream, accessToken: undefined, refreshToken: undefined, idToken: undefined },
      { status: 201 }
    );
  } catch (error) {
    console.error("[admin/upstream POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
