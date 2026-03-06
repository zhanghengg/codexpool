"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface UsageStat {
  date: string;
  requestCount: number;
  tokenUsage: number;
}

interface UsageData {
  days: number;
  stats: UsageStat[];
  totalRequests: number;
  totalTokens: number;
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch("/api/user/usage?days=30");
        if (!res.ok) throw new Error("获取失败");
        const json = await res.json();
        setData(json);
      } catch {
        setError("加载用量数据失败");
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">用量统计</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              统计周期
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">近 {data!.days} 天</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              总请求数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data!.totalRequests.toLocaleString()}
            </p>
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
              {data!.totalTokens.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              日均请求
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data!.days > 0
                ? Math.round(data!.totalRequests / data!.days).toLocaleString()
                : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle>每日明细</CardTitle>
          <p className="text-sm text-muted-foreground">
            按日期汇总的请求次数与 Token 使用量
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead className="text-right">请求次数</TableHead>
                <TableHead className="text-right">Token 用量</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.stats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    <p className="text-muted-foreground">暂无数据</p>
                  </TableCell>
                </TableRow>
              ) : (
                data!.stats.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>
                      {format(new Date(row.date), "yyyy年M月d日", {
                        locale: zhCN,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.requestCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.tokenUsage.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
