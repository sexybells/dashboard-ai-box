"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { nextTheme, resolveInitialTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const THEME_CHANGE_EVENT = "aibox-theme-change";

function subscribe(callback: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
    media.removeEventListener("change", callback);
  };
}

function getClientTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return resolveInitialTheme(stored, prefersDark);
}

// Reflects and controls the `.dark` class on <html>. Uses useSyncExternalStore
// so the value hydrates cleanly (server → "light", client → real theme) without
// setState-in-effect. Initial paint itself is handled by the inline script.
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, getClientTheme, () => "light");
  const isDark = theme === "dark";

  function toggle() {
    const next = nextTheme(theme);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isDark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </button>
  );
}
