"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_GROUPS } from "@/components/shell/nav-config";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarProps {
  /** Mobile drawer open state. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldAlert className="size-5" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">AI Box</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng menu"
            className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent lg:hidden"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Icon className="size-4.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {item.soon ? (
                          <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                            Soon
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-5 py-4 text-[11px] text-muted-foreground">
          Giám sát cảnh báo AI Box
        </div>
      </aside>
    </>
  );
}
