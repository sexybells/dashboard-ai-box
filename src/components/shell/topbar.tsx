"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { NAV_GROUPS } from "@/components/shell/nav-config";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { logout } from "@/services/auth-client";

function currentTitle(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) {
        return item.label;
      }
    }
  }
  return "AI Box";
}

interface TopbarProps {
  onOpenMenu: () => void;
}

export function Topbar({ onOpenMenu }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleLogout() {
    setIsSigningOut(true);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Mở menu"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
      >
        <Menu className="size-4.5" />
      </button>

      <h1 className="text-base font-semibold tracking-tight sm:text-lg">{currentTitle(pathname)}</h1>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Tìm kiếm..."
            className="h-9 w-56 rounded-md border border-input bg-card pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <button
          type="button"
          aria-label="Thông báo"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Bell className="size-4.5" />
        </button>

        <ThemeToggle />

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isSigningOut}
          aria-label="Đăng xuất"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="size-4.5" />
        </button>

        <span
          aria-hidden
          className="ml-1 inline-flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
        >
          AB
        </span>
      </div>
    </header>
  );
}
