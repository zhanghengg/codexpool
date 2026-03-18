"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Trash2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface ApiKey {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function fetchKeys() {
    try {
      const res = await fetch("/api/user/keys");
      if (!res.ok) throw new Error("获取失败");
      const data = await res.json();
      setKeys(data);
    } catch {
      toast.error("加载 API 密钥失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function handleCreate() {
    if (!createName.trim()) {
      toast.error("请输入密钥名称");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch("/api/user/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      setNewKey(data.key);
      setCreateName("");
      await fetchKeys();
      toast.success("API 密钥已创建，请妥善保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/user/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setKeys((prev) => prev.filter((k) => k.id !== id));
      setDeleteId(null);
      toast.success("API 密钥已删除");
    } catch {
      toast.error("删除失败");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  }

  async function copyFullKey(id: string) {
    try {
      const res = await fetch(`/api/user/keys/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      await navigator.clipboard.writeText(data.key);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setCreateName("");
    setNewKey(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">API 密钥</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              创建密钥
            </Button>
          </DialogTrigger>
          <DialogContent
            onPointerDownOutside={(e) => {
              if (newKey) e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              if (newKey) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {newKey ? "密钥已创建" : "创建新密钥"}
              </DialogTitle>
              <DialogDescription>
                {newKey
                  ? "请立即复制并妥善保存密钥，关闭后将无法再次查看完整密钥。"
                  : "为密钥起一个便于识别的名称。"}
              </DialogDescription>
            </DialogHeader>
            {newKey ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={newKey}
                    className="font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(newKey)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  请立即保存此密钥，关闭后将无法再次查看完整内容。
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="key-name">密钥名称</Label>
                  <Input
                    id="key-name"
                    placeholder="例如：生产环境"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              {newKey ? (
                <Button onClick={closeCreateDialog}>完成</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleCreate} disabled={createLoading}>
                    {createLoading ? "创建中..." : "创建"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Key className="mb-4 size-12 text-muted-foreground" />
            <p className="mb-2 text-muted-foreground">暂无 API 密钥</p>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              创建密钥后即可在应用中调用 API
            </p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="size-4" />
              创建密钥
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>密钥列表</CardTitle>
            <p className="text-sm text-muted-foreground">
              每个密钥最多 5 个，请妥善保管
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>密钥</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {k.name}
                        {!k.isActive && (
                          <Badge variant="secondary">已停用</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm text-muted-foreground">
                          {k.key}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground"
                          onClick={() => copyFullKey(k.id)}
                          title="复制完整密钥"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(k.createdAt), "yyyy-MM-dd HH:mm", {
                        locale: zhCN,
                      })}
                    </TableCell>
                    <TableCell>
                      <Dialog
                        open={deleteId === k.id}
                        onOpenChange={(open) => !open && setDeleteId(null)}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(k.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>确认删除</DialogTitle>
                            <DialogDescription>
                              删除后该密钥将立即失效，使用该密钥的请求将无法通过。是否继续？
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setDeleteId(null)}
                            >
                              取消
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleDelete(k.id)}
                            >
                              删除
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
