import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Locks the Zenith design-token contract in globals.css so pages can rely on
// exact colors and radius. Values extracted from Zenith's app.css (light :root
// and .dark override). See plan.md "Design Tokens".
const cssPath = fileURLToPath(new URL("./globals.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");

// Collapse whitespace to make substring assertions resilient to formatting.
const normalized = css.replace(/\s+/g, " ");

describe("Zenith theme tokens", () => {
  it("imports Tailwind", () => {
    expect(normalized).toContain('@import "tailwindcss"');
  });

  it.each([
    ["--background", "oklch(100% 0 0)"],
    ["--foreground", "oklch(14.5% 0 0)"],
    ["--card", "oklch(100% 0 0)"],
    ["--primary", "oklch(20.5% 0 0)"],
    ["--muted", "oklch(96.5% 0 0)"],
    ["--muted-foreground", "oklch(55.6% 0 0)"],
    ["--border", "oklch(92.2% 0 0)"],
    ["--ring", "oklch(70.8% 0 0)"],
    ["--sidebar", "oklch(98.5% 0 0)"],
    ["--sidebar-border", "oklch(92.2% 0 0)"],
    ["--destructive", "oklch(57.7% .245 27.325)"],
    ["--radius", ".625rem"]
  ])("defines light %s", (token, value) => {
    expect(normalized).toContain(`${token}: ${value}`);
  });

  it("uses blue-600 for the sidebar accent in dark mode", () => {
    expect(normalized).toContain("oklch(48.8% .243 264.376)");
  });

  it("has a .dark block that redefines --background", () => {
    const darkBlock = css.match(/\.dark\s*\{[\s\S]*?\}/);
    expect(darkBlock, "expected a .dark { ... } block").not.toBeNull();
    expect(darkBlock?.[0].replace(/\s+/g, " ")).toContain("--background: oklch(7.5% 0 0)");
  });
});
