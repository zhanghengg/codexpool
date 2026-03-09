"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface SubscriptionData {
  subscription: {
    id: string;
    expireAt: string;
  } | null;
  plan: {
    name: string;
    dailyRequestLimit: number;
    dailyTokenLimit: number;
    totalTokenLimit: number;
  } | null;
  usage: {
    dailyRequestsUsed: number;
    dailyTokensUsed: number;
    totalTokensUsed: number;
  } | null;
  percentageUsed: {
    dailyRequests: number;
    dailyTokens: number;
    totalTokens: number;
  } | null;
  cost: {
    dailyCost: number;
    totalCost: number;
  } | null;
}

interface UsageStats {
  days: number;
  stats: { date: string; requestCount: number; tokenUsage: number; cost: number }[];
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
}

function formatUSD(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [subRes, usageRes] = await Promise.all([
          fetch("/api/user/subscription"),
          fetch("/api/user/usage?days=7"),
        ]);

        if (!subRes.ok) throw new Error("获取订阅失败");
        if (!usageRes.ok) throw new Error("获取用量失败");

        const subData = await subRes.json();
        const usageData = await usageRes.json();

        setSub(subData);
        setUsage(usageData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        {error}
      </div>
    );
  }

  const hasSubscription = sub?.subscription && sub?.plan && sub?.usage;

  if (!hasSubscription) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Gift className="mb-4 size-12 text-muted-foreground" />
            <p className="mb-2 text-center text-muted-foreground">
              您还没有激活订阅
            </p>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              请先兑换激活码以开始使用
            </p>
            <Link href="/dashboard/redeem">
              <Button className="gap-2">
                <Gift className="size-4" />
                去兑换
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { plan, usage: usageData, percentageUsed } = sub;
  const maxReq = Math.max(...(usage?.stats.map((s) => s.requestCount) ?? [1]), 1);
  const maxTok = Math.max(...(usage?.stats.map((s) => s.tokenUsage) ?? [1]), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>

      {/* Plan & Expiry */}
      <div className="flex flex-wrap items-center gap-4">
        <Card className="min-w-[200px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              当前套餐
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold">{plan!.name}</span>
              <Badge variant="secondary">有效</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              到期时间：{format(new Date(sub.subscription!.expireAt), "yyyy年M月d日", { locale: zhCN })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              今日请求
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {usageData!.dailyRequestsUsed} / {plan!.dailyRequestLimit === 0 ? "∞" : plan!.dailyRequestLimit}
            </p>
            {plan!.dailyRequestLimit > 0 && (
              <UsageBar
                value={usageData!.dailyRequestsUsed}
                max={plan!.dailyRequestLimit}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              今日 Token
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {usageData!.dailyTokensUsed.toLocaleString()} / {plan!.dailyTokenLimit === 0 ? "∞" : plan!.dailyTokenLimit.toLocaleString()}
            </p>
            {plan!.dailyTokenLimit > 0 && (
              <UsageBar
                value={usageData!.dailyTokensUsed}
                max={plan!.dailyTokenLimit}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              总 Token 用量
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {usageData!.totalTokensUsed.toLocaleString()} / {plan!.totalTokenLimit === 0 ? "∞" : plan!.totalTokenLimit.toLocaleString()}
            </p>
            {plan!.totalTokenLimit > 0 && (
              <UsageBar
                value={usageData!.totalTokensUsed}
                max={plan!.totalTokenLimit}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Cards */}
      {sub.cost && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <DollarSign className="size-4" />
                今日预估费用
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatUSD(sub.cost.dailyCost)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                按 OpenAI 官方定价估算
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <DollarSign className="size-4" />
                累计预估费用
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatUSD(sub.cost.totalCost)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                订阅期间累计等价金额
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <DollarSign className="size-4" />
                近 7 日费用
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatUSD(usage?.totalCost ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                最近 7 天用量等价金额
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Simple Bar Chart - Last 7 days */}
      <Card>
        <CardHeader>
          <CardTitle>近 7 日用量</CardTitle>
          <p className="text-sm text-muted-foreground">
            请求次数与 Token 使用量
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-end gap-2">
            {usage?.stats.map((day) => (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div className="flex w-full flex-1 flex-col justify-end gap-0.5">
                  <div
                    className="w-full rounded-t bg-primary/80 transition-all"
                    style={{
                      height: `${(day.requestCount / maxReq) * 50}%`,
                      minHeight: day.requestCount > 0 ? "4px" : "0",
                    }}
                    title={`请求: ${day.requestCount}`}
                  />
                  <div
                    className="w-full rounded-t bg-primary/40 transition-all"
                    style={{
                      height: `${(day.tokenUsage / maxTok) * 50}%`,
                      minHeight: day.tokenUsage > 0 ? "4px" : "0",
                    }}
                    title={`Token: ${day.tokenUsage}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(day.date), "M/d", { locale: zhCN })}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-primary/80" /> 请求
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-primary/40" /> Token
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
