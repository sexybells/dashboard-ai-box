// Theme resolution helpers. Pure + DOM-free so they are unit-testable and can
// run inside the pre-hydration inline script in layout.tsx.

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "aibox-theme";

/**
 * Decide the initial theme: an explicitly stored choice wins; otherwise fall
 * back to the OS preference.
 */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

/** Toggle between the two themes. */
export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/**
 * Inline script (stringified) that applies the persisted/OS theme before first
 * paint to avoid a flash of the wrong theme. Injected in <head>.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=(s==="light"||s==="dark")?s:(d?"dark":"light");document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`;
