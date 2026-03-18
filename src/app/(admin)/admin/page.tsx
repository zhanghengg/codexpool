"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CreditCard, Zap, Coins, DollarSign, Server, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface Stats {
  totalUsers: number;
  activeSubscriptions: number;
  todayRequests: number;
  todayTokens: number;
  todayCost: number;
  upstreamHealth: {
    total: number;
    active: number;
    healthy: number;
  };
  recentErrors: Array<{
    id: string;
    userId: string;
    endpoint: string;
    errorMessage: string | null;
    statusCode: number;
    createdAt: string;
  }>;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) {
          throw new Error("获取统计数据失败");
        }
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: "总用户数",
      value: stats.totalUsers,
      icon: Users,
    },
    {
      title: "活跃订阅",
      value: stats.activeSubscriptions,
      icon: CreditCard,
    },
    {
      title: "今日请求",
      value: stats.todayRequests,
      icon: Zap,
    },
    {
      title: "今日 Token",
      value: stats.todayTokens.toLocaleString(),
      icon: Coins,
    },
    {
      title: "今日消耗",
      value: stats.todayCost < 0.01 ? `$${stats.todayCost.toFixed(4)}` : `$${stats.todayCost.toFixed(2)}`,
      icon: DollarSign,
    },
  ];

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">管理概览</h1>

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-5" />
              上游健康状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="default">健康</Badge>
                <span className="text-2xl font-bold text-green-600">
                  {stats.upstreamHealth.healthy}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">不健康</Badge>
                <span className="text-2xl font-bold text-amber-600">
                  {stats.upstreamHealth.active - stats.upstreamHealth.healthy}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">总计</Badge>
                <span className="text-2xl font-bold">
                  {stats.upstreamHealth.total}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5" />
            最近错误
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            最近 10 条错误记录
          </p>
        </CardHeader>
        <CardContent>
          {stats.recentErrors.length === 0 ? (
            <p className="text-muted-foreground">暂无错误记录</p>
          ) : (
            <div className="space-y-3">
              {stats.recentErrors.map((err) => (
                <div
                  key={err.id}
                  className="rounded-lg border bg-muted/30 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{err.endpoint}</span>
                    <Badge variant="destructive">{err.statusCode}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground line-clamp-2">
                    {err.errorMessage || "未知错误"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(err.createdAt), "PPpp", { locale: zhCN })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
