"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) throw new Error("获取设置失败");
        const data = await res.json();
        setRegistrationOpen(data.registration_open === "true");
        setAnnouncement(data.announcement ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  async function saveSetting(key: string, value: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("保存失败");
      toast.success("设置已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleRegistrationToggle() {
    const next = !registrationOpen;
    setRegistrationOpen(next);
    saveSetting("registration_open", next ? "true" : "false");
  }

  function handleAnnouncementSave() {
    saveSetting("announcement", announcement);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-48 rounded-lg bg-muted" />
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
      <h1 className="mb-6 text-2xl font-bold">系统设置</h1>

      <Card>
        <CardHeader>
          <CardTitle>基础设置</CardTitle>
          <p className="text-sm text-muted-foreground">
            控制系统全局行为
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">开放注册</Label>
              <p className="text-sm text-muted-foreground">
                关闭后新用户将无法注册
              </p>
            </div>
            <button
              role="switch"
              aria-checked={registrationOpen}
              onClick={handleRegistrationToggle}
              disabled={saving}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                registrationOpen ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  registrationOpen ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>公告内容</Label>
            <p className="text-sm text-muted-foreground">
              显示在首页或控制台的公告文本
            </p>
            <div className="flex gap-2">
              <Input
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="输入公告内容..."
                className="flex-1"
              />
              <Button
                onClick={handleAnnouncementSave}
                disabled={saving}
              >
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
