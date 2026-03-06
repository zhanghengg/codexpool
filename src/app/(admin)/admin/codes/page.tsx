"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Plus, Copy, Trash2 } from "lucide-react";

interface Plan {
  id: string;
  name: string;
}

interface RedeemCode {
  id: string;
  code: string;
  planId: string;
  plan: { name: string };
  status: "unused" | "used" | "available" | "expired";
  usedCount: number;
  maxUses: number;
  expireAt: string | null;
  createdAt: string;
}

export default function AdminCodesPage() {
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    planId: "",
    count: 10,
    expireDays: 30,
    maxUses: 1,
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [page]);

  async function fetchPlans() {
    try {
      const res = await fetch("/api/admin/plans");
      if (!res.ok) return;
      const data = await res.json();
      setPlans(data.data.filter((p: Plan & { isActive?: boolean }) => p.isActive !== false));
    } catch {
      // ignore
    }
  }

  async function fetchCodes() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/redeem-codes?page=${page}&limit=20`);
      if (!res.ok) throw new Error("获取兑换码失败");
      const data = await res.json();
      setCodes(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateCodes() {
    if (!form.planId) {
      toast.error("请选择套餐");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/redeem-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: form.planId,
          count: form.count,
          expireDays: form.expireDays || undefined,
          maxUses: form.maxUses,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "生成失败");
      }
      const data = await res.json();
      setGeneratedCodes(data.codes);
      toast.success(`已生成 ${data.count} 个兑换码`);
      fetchCodes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setSubmitting(false);
    }
  }

  function copyAllCodes() {
    if (!generatedCodes?.length) return;
    const text = generatedCodes.join("\n");
    navigator.clipboard.writeText(text);
    toast.success("已复制全部兑换码");
  }

  async function deleteCode(code: RedeemCode) {
    if (!confirm(`确定要删除兑换码 ${code.code} 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/redeem-codes/${code.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("删除失败");
      setCodes((prev) => prev.filter((c) => c.id !== code.id));
      toast.success("已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "unused":
      case "available":
        return <Badge variant="default">未使用</Badge>;
      case "used":
        return <Badge variant="secondary">已使用</Badge>;
      case "expired":
        return <Badge variant="destructive">已过期</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (loading && !codes.length) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (error && !codes.length) {
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

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">兑换码管理</h1>
        <Dialog
          open={generateOpen}
          onOpenChange={(o) => {
            setGenerateOpen(o);
            if (!o) setGeneratedCodes(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              生成兑换码
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>生成兑换码</DialogTitle>
              <DialogDescription>
                {generatedCodes ? (
                  "兑换码已生成，请妥善保存"
                ) : (
                  "选择套餐并设置生成参数"
                )}
              </DialogDescription>
            </DialogHeader>
            {generatedCodes ? (
              <div className="space-y-4 py-4">
                <div className="max-h-48 overflow-y-auto rounded border bg-muted/30 p-3 font-mono text-sm">
                  {generatedCodes.map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </div>
                <Button onClick={copyAllCodes} className="w-full">
                  <Copy className="mr-2 size-4" />
                  复制全部
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>套餐</Label>
                    <Select
                      value={form.planId}
                      onValueChange={(v) => setForm({ ...form, planId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择套餐" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>生成数量</Label>
                    <Input
                      type="number"
                      value={form.count}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          count: parseInt(e.target.value) || 1,
                        })
                      }
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>有效期(天)，0 表示永久</Label>
                    <Input
                      type="number"
                      value={form.expireDays}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          expireDays: parseInt(e.target.value) || 0,
                        })
                      }
                      min={0}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>最大使用次数</Label>
                    <Input
                      type="number"
                      value={form.maxUses}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maxUses: parseInt(e.target.value) || 1,
                        })
                      }
                      min={1}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGenerateOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={generateCodes} disabled={submitting}>
                    {submitting ? "生成中..." : "生成"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>兑换码列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>兑换码</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>使用次数</TableHead>
                <TableHead>过期时间</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.code}</TableCell>
                  <TableCell>{c.plan?.name ?? "-"}</TableCell>
                  <TableCell>{getStatusBadge(c.status)}</TableCell>
                  <TableCell>
                    {c.usedCount} / {c.maxUses}
                  </TableCell>
                  <TableCell>
                    {c.expireAt
                      ? format(new Date(c.expireAt), "yyyy-MM-dd", {
                          locale: zhCN,
                        })
                      : "永久"}
                  </TableCell>
                  <TableCell>
                    {format(new Date(c.createdAt), "yyyy-MM-dd HH:mm", {
                      locale: zhCN,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteCode(c)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                共 {pagination.total} 条，第 {page} / {pagination.totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
