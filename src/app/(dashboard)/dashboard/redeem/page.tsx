"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface SubscriptionInfo {
  subscription: { expireAt: string } | null;
  plan: { name: string } | null;
}

export default function RedeemPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);

  async function fetchSubscription() {
    try {
      const res = await fetch("/api/user/subscription");
      if (!res.ok) return;
      const data = await res.json();
      setSub(data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchSubscription();
  }, []);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("请输入兑换码");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "兑换失败");
      toast.success("兑换成功！");
      setCode("");
      await fetchSubscription();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "兑换失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">兑换码</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Redeem Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="size-5" />
              兑换激活码
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              输入您获得的兑换码以激活或续费订阅
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRedeem} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="redeem-code">兑换码</Label>
                <Input
                  id="redeem-code"
                  placeholder="请输入兑换码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                  disabled={loading}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full gap-2">
                <Gift className="size-4" />
                {loading ? "兑换中..." : "立即兑换"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Current Subscription */}
        <Card>
          <CardHeader>
            <CardTitle>当前订阅</CardTitle>
            <p className="text-sm text-muted-foreground">
              您当前的套餐与到期时间
            </p>
          </CardHeader>
          <CardContent>
            {sub?.subscription && sub?.plan ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">套餐名称</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{sub.plan.name}</span>
                    <Badge variant="secondary">有效</Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">到期时间</span>
                  <span>
                    {format(new Date(sub.subscription.expireAt), "yyyy年M月d日", {
                      locale: zhCN,
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <Gift className="mb-4 size-12 text-muted-foreground" />
                <p className="text-muted-foreground">暂无有效订阅</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  兑换激活码后可开始使用
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
