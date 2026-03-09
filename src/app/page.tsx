import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  Zap,
  Shield,
  Key,
  ArrowRight,
  CheckCircle2,
  Layers,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-xs font-bold">C</span>
            </div>
            <span className="text-sm font-semibold md:text-base">CodexPool</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login">
              <Button size="sm" variant="ghost" className="h-8 px-3 text-xs md:text-sm">
                登录
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="h-8 px-3 text-xs md:text-sm">
                免费注册
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),transparent)]" />
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-20 md:px-6 md:py-28">
          <div className="mx-auto max-w-3xl space-y-6 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-[56px]">
              OpenAI 兼容
              <span className="block bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                API 中转服务
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              稳定、高效、易用的 API 代理服务。无缝对接 OpenAI 格式，轻松管理配额与用量，让您的应用快速接入大模型能力。
            </p>
            <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-center">
              <Link href="/register">
                <Button size="lg" className="h-10 gap-2 px-5 text-sm">
                  开始使用
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="h-10 px-5 text-sm">
                  已有账户？登录
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative bg-muted/20 py-20 md:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              核心能力
            </h2>
            <p className="mt-3 text-sm text-muted-foreground md:text-base">
              专为开发者打造的 API 中转服务，让您的集成更简单
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/20 hover:shadow-md dark:hover:border-primary/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Zap className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">稳定中转</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                高可用架构，支持多上游源切换，保证服务稳定可靠。
              </p>
            </div>
            <div className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/20 hover:shadow-md dark:hover:border-primary/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">配额管理</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                灵活的用量统计与配额控制，支持订阅与套餐管理。
              </p>
            </div>
            <div className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/20 hover:shadow-md dark:hover:border-primary/30 sm:col-span-2 lg:col-span-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">即插即用</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                完全兼容 OpenAI API 格式，无需修改现有代码即可接入。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              三步上手
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              注册账号，获取 API Key，立即开始调用
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl gap-12 md:grid-cols-3">
            <div className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-primary/5 text-primary">
                <span className="text-xl font-bold">1</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">注册账户</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                使用邮箱快速注册，获取专属控制台
              </p>
              <div className="absolute -right-6 top-1/2 hidden h-px w-12 -translate-y-1/2 bg-gradient-to-r from-border to-transparent md:block" />
            </div>
            <div className="relative flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-primary/5 text-primary">
                <Key className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">获取 API Key</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                在控制台创建 API Key，支持多密钥管理
              </p>
              <div className="absolute -right-6 top-1/2 hidden h-px w-12 -translate-y-1/2 bg-gradient-to-r from-border to-transparent md:block" />
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary bg-primary/5 text-primary">
                <CheckCircle2 className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">开始使用</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                将 OpenAI 客户端 baseURL 指向我们的 API 即可
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 bg-muted/30 py-24">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm md:p-12">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Shield className="size-6" />
              </div>
            </div>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">
              立即开始使用 CodexPool
            </h2>
            <p className="mt-2 text-muted-foreground">
              免费注册，即刻体验 OpenAI 兼容 API 中转服务
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link href="/register">
                <Button size="lg" className="gap-2">
                  免费注册
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  登录
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-sm font-bold">C</span>
              </div>
              <span className="font-semibold">CodexPool</span>
            </div>
            <p className="text-sm text-muted-foreground">
              OpenAI 兼容 API 中转服务
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
