"use client";

import { useEffect, useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Power, PowerOff, Upload } from "lucide-react";

interface Upstream {
  id: string;
  name: string;
  email: string;
  accountId: string;
  tokenExpiry: string;
  lastRefresh: string | null;
  baseUrl: string;
  weight: number;
  isActive: boolean;
  isHealthy: boolean;
  errorCount: number;
  totalUsed: number;
  createdAt: string;
}

interface FileInfo {
  name: string;
  count: number;
  tokens: Record<string, unknown>[];
}

function isExpired(dateStr: string) {
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN");
}

export default function AdminUpstreamPage() {
  const [upstreams, setUpstreams] = useState<Upstream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [tokenJson, setTokenJson] = useState("");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);

  useEffect(() => { fetchUpstreams(); }, []);

  async function fetchUpstreams() {
    try {
      const res = await fetch("/api/admin/upstream");
      if (!res.ok) throw new Error("获取上游列表失败");
      const data = await res.json();
      setUpstreams(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function submitImport() {
    let tokens: Record<string, unknown>[];

    if (fileInfo) {
      tokens = fileInfo.tokens;
    } else if (tokenJson.trim()) {
      try {
        const parsed = JSON.parse(tokenJson);
        tokens = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        toast.error("JSON 格式不正确");
        return;
      }
    } else {
      toast.error("请上传文件或粘贴 JSON");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/upstream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "导入失败");
      }
      const result = await res.json();
      toast.success(`成功导入 ${result.count} 个账户`);
      setCreateOpen(false);
      setTokenJson("");
      setFileInfo(null);
      fetchUpstreams();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const tokens = Array.isArray(parsed) ? parsed : [parsed];
      setFileInfo({ name: file.name, count: tokens.length, tokens });
      setTokenJson("");
      toast.success(`已读取: ${file.name}（${tokens.length} 个账户）`);
    } catch {
      toast.error("文件内容不是有效 JSON");
    }
    e.target.value = "";
  }

  async function toggleActive(u: Upstream) {
    setActioning(u.id);
    try {
      const res = await fetch(`/api/admin/upstream/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleActive" }),
      });
      if (!res.ok) throw new Error("操作失败");
      setUpstreams((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, isActive: !x.isActive } : x))
      );
      toast.success(u.isActive ? "已停用" : "已启用");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActioning(null);
    }
  }

  async function resetHealth(u: Upstream) {
    setActioning(u.id);
    try {
      const res = await fetch(`/api/admin/upstream/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetHealth" }),
      });
      if (!res.ok) throw new Error("操作失败");
      setUpstreams((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, isHealthy: true, errorCount: 0 } : x))
      );
      toast.success("健康状态已重置");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActioning(null);
    }
  }

  async function deleteUpstream(u: Upstream) {
    if (!confirm(`确定要删除上游「${u.name}」吗？此操作不可恢复。`)) return;
    setActioning(u.id);
    try {
      const res = await fetch(`/api/admin/upstream/${u.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setUpstreams((prev) => prev.filter((x) => x.id !== u.id));
      toast.success("已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActioning(null);
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
        <h1 className="text-2xl font-bold">上游账户</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              添加账户
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>导入 Codex 账户</DialogTitle>
              <DialogDescription>
                上传 Token JSON 文件或粘贴 JSON 内容，支持单个和批量导入
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Label htmlFor="file-upload" className="cursor-pointer block">
                <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 hover:bg-muted/50 transition-colors text-center">
                  <Upload className="size-8 text-muted-foreground" />
                  {fileInfo ? (
                    <div>
                      <p className="text-sm font-medium">{fileInfo.name}</p>
                      <p className="text-xs text-muted-foreground">{fileInfo.count} 个账户已读取</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">点击选择 JSON 文件</p>
                      <p className="text-xs text-muted-foreground">支持单个 Token JSON 或 JSON 数组</p>
                    </div>
                  )}
                </div>
              </Label>
              <input
                id="file-upload"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
              />

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">或手动粘贴</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Token JSON</Label>
                <Textarea
                  value={tokenJson}
                  onChange={(e) => setTokenJson(e.target.value)}
                  placeholder='{"access_token":"...","refresh_token":"...","account_id":"...","email":"...","expired":"..."}'
                  rows={4}
                  className="font-mono text-xs max-h-[200px] overflow-y-auto resize-none"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateOpen(false); setFileInfo(null); setTokenJson(""); }}>取消</Button>
              <Button onClick={submitImport} disabled={submitting || (!fileInfo && !tokenJson.trim())}>
                {submitting ? "导入中..." : fileInfo ? `导入 ${fileInfo.count} 个账户` : "导入"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>上游列表 ({upstreams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {upstreams.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              暂无上游账户，点击右上角「添加账户」导入 Codex Token
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead>Token 过期</TableHead>
                  <TableHead>权重</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>健康</TableHead>
                  <TableHead>错误</TableHead>
                  <TableHead>已用</TableHead>
                  <TableHead className="w-[140px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upstreams.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={isExpired(u.tokenExpiry) ? "destructive" : "default"}>
                        {isExpired(u.tokenExpiry) ? "已过期" : formatDate(u.tokenExpiry)}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.weight}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "default" : "secondary"}>
                        {u.isActive ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isHealthy ? "default" : "destructive"}>
                        {u.isHealthy ? "健康" : "异常"}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.errorCount}</TableCell>
                    <TableCell>{u.totalUsed.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => toggleActive(u)}
                          disabled={actioning === u.id}
                          title={u.isActive ? "停用" : "启用"}
                        >
                          {u.isActive ? <PowerOff className="size-3" /> : <Power className="size-3" />}
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => resetHealth(u)}
                          disabled={actioning === u.id}
                          title="重置健康"
                        >
                          <RefreshCw className="size-3" />
                        </Button>
                        <Button
                          variant="destructive" size="sm"
                          onClick={() => deleteUpstream(u)}
                          disabled={actioning === u.id}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
