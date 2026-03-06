"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Key,
  BarChart3,
  Gift,
  LogOut,
  Menu,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { href: "/dashboard/keys", label: "API 密钥", icon: Key },
  { href: "/dashboard/usage", label: "用量统计", icon: BarChart3 },
  { href: "/dashboard/redeem", label: "兑换码", icon: Gift },
];

interface DashboardSidebarProps {
  userEmail: string;
  userRole: string;
}

function NavLinks({ isMobile = false }: { isMobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
        return isMobile ? (
          <SheetClose key={item.href} asChild>
            {link}
          </SheetClose>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function useHandleSignOut() {
  const router = useRouter();
  return async () => {
    try {
      await signOut({ redirect: false });
      router.push("/login");
      router.refresh();
    } catch {
      window.location.href = "/login";
    }
  };
}

function MobileNavContent({ userEmail, userRole }: DashboardSidebarProps) {
  const handleSignOut = useHandleSignOut();
  return (
    <>
      <SheetHeader className="text-left">
        <SheetTitle>CodexPool</SheetTitle>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-4 py-4">
        <NavLinks isMobile />
        {userRole === "ADMIN" && (
          <>
            <Separator />
            <SheetClose asChild>
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Shield className="size-4 shrink-0" />
                管理后台
              </Link>
            </SheetClose>
          </>
        )}
      </div>
      <div className="mt-auto space-y-2 border-t pt-4">
        <p className="truncate px-3 text-xs text-muted-foreground">
          {userEmail}
        </p>
        <SheetClose asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" />
            退出登录
          </Button>
        </SheetClose>
      </div>
    </>
  );
}

export function DashboardSidebar({ userEmail, userRole }: DashboardSidebarProps) {
  const handleSignOut = useHandleSignOut();
  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-bold text-sm">C</span>
          </div>
          <span className="font-semibold">CodexPool</span>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <NavLinks />
          {userRole === "ADMIN" && (
            <>
              <Separator />
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Shield className="size-4 shrink-0" />
                管理后台
              </Link>
            </>
          )}
        </div>
        <div className="border-t p-4">
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* Mobile Header with Hamburger */}
      <div className="flex h-16 items-center justify-between border-b bg-card px-4 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="size-5" />
              <span className="sr-only">打开菜单</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-64 flex-col">
            <MobileNavContent userEmail={userEmail} userRole={userRole} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-bold text-xs">C</span>
          </div>
          <span className="font-semibold">CodexPool</span>
        </div>
        <div className="w-9" />
      </div>
    </>
  );
}
