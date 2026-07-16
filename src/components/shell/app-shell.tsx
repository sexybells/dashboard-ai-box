"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

// App shell: fixed sidebar + sticky topbar + scrollable content. Holds the
// mobile drawer open state.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  if (pathname === "/login") {
    return <main className="min-h-dvh bg-background">{children}</main>;
  }

  // /camera dùng hết bề ngang để khung xem to nhất; các trang khác giữ max-w-7xl.
  const fullBleed = pathname === "/camera";

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className={`mx-auto w-full ${fullBleed ? "max-w-none" : "max-w-7xl"}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
