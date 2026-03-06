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
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  description: string;
  durationDays: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  totalTokenLimit: number;
  rpm: number;
  allowedModels: string[];
  isActive: boolean;
  sortOrder: number;
}

const defaultPlan: Partial<Plan> = {
  name: "",
  description: "",
  durationDays: 30,
  dailyRequestLimit: 100,
  dailyTokenLimit: 100000,
  totalTokenLimit: 1000000,
  rpm: 10,
  allowedModels: [],
  isActive: true,
  sortOrder: 0,
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<Partial<Plan>>(defaultPlan);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      const res = await fetch("/api/admin/plans");
      if (!res.ok) throw new Error("获取套餐列表失败");
      const data = await res.json();
      setPlans(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setForm(defaultPlan);
    setCreateOpen(true);
  }

  function handleEdit(plan: Plan) {
    setEditPlan(plan);
    setForm({
      name: plan.name,
      description: plan.description,
      durationDays: plan.durationDays,
      dailyRequestLimit: plan.dailyRequestLimit,
      dailyTokenLimit: plan.dailyTokenLimit,
      totalTokenLimit: plan.totalTokenLimit,
      rpm: plan.rpm,
      allowedModels: plan.allowedModels,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    });
  }

  async function submitCreate() {
    if (!form.name || form.durationDays == null) {
      toast.error("请填写必填项");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description ?? "",
          durationDays: form.durationDays,
          dailyRequestLimit: form.dailyRequestLimit ?? 0,
          dailyTokenLimit: form.dailyTokenLimit ?? 0,
          totalTokenLimit: form.totalTokenLimit ?? 0,
          rpm: form.rpm ?? 10,
          allowedModels: form.allowedModels ?? [],
          isActive: form.isActive ?? true,
          sortOrder: form.sortOrder ?? 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "创建失败");
      }
      toast.success("套餐创建成功");
      setCreateOpen(false);
      fetchPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit() {
    if (!editPlan || !form.name) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/plans/${editPlan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "更新失败");
      }
      toast.success("套餐更新成功");
      setEditPlan(null);
      fetchPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function softDelete(plan: Plan) {
    if (!confirm(`确定要停用套餐「${plan.name}」吗？`)) return;
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("停用失败");
      toast.success("套餐已停用");
      fetchPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "停用失败");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-64 rounded-lg bg-muted" />
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

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">套餐管理</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 size-4" />
              新建套餐
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建套餐</DialogTitle>
              <DialogDescription>填写套餐信息</DialogDescription>
            </DialogHeader>
            <PlanForm form={form} setForm={setForm} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button onClick={submitCreate} disabled={submitting}>
                {submitting ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>套餐列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>时长(天)</TableHead>
                <TableHead>日请求限制</TableHead>
                <TableHead>日 Token 限制</TableHead>
                <TableHead>总 Token 限制</TableHead>
                <TableHead>RPM</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-[140px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.durationDays}</TableCell>
                  <TableCell>{plan.dailyRequestLimit}</TableCell>
                  <TableCell>{plan.dailyTokenLimit.toLocaleString()}</TableCell>
                  <TableCell>{plan.totalTokenLimit.toLocaleString()}</TableCell>
                  <TableCell>{plan.rpm}</TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? "default" : "secondary"}>
                      {plan.isActive ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(plan)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      {plan.isActive && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => softDelete(plan)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editPlan} onOpenChange={(o) => !o && setEditPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑套餐</DialogTitle>
          </DialogHeader>
          <PlanForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlan(null)}>
              取消
            </Button>
            <Button onClick={submitEdit} disabled={submitting}>
              {submitting ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanForm({
  form,
  setForm,
}: {
  form: Partial<Plan>;
  setForm: (f: Partial<Plan>) => void;
}) {
  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label>名称</Label>
        <Input
          value={form.name ?? ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="套餐名称"
        />
      </div>
      <div className="grid gap-2">
        <Label>描述</Label>
        <Input
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="套餐描述"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>时长(天)</Label>
          <Input
            type="number"
            value={form.durationDays ?? ""}
            onChange={(e) =>
              setForm({ ...form, durationDays: parseInt(e.target.value) || 0 })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label>RPM</Label>
          <Input
            type="number"
            value={form.rpm ?? ""}
            onChange={(e) =>
              setForm({ ...form, rpm: parseInt(e.target.value) || 0 })
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>日请求限制</Label>
          <Input
            type="number"
            value={form.dailyRequestLimit ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                dailyRequestLimit: parseInt(e.target.value) || 0,
              })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label>日 Token 限制</Label>
          <Input
            type="number"
            value={form.dailyTokenLimit ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                dailyTokenLimit: parseInt(e.target.value) || 0,
              })
            }
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>总 Token 限制</Label>
        <Input
          type="number"
          value={form.totalTokenLimit ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              totalTokenLimit: parseInt(e.target.value) || 0,
            })
          }
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={form.isActive ?? true}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          className="rounded"
        />
        <Label htmlFor="isActive">启用</Label>
      </div>
    </div>
  );
}
