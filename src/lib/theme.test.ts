import { describe, expect, it } from "vitest";
import { nextTheme, resolveInitialTheme } from "@/lib/theme";

describe("resolveInitialTheme", () => {
  it("uses the stored theme when valid", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("falls back to OS preference when nothing stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("ignores invalid stored values", () => {
    expect(resolveInitialTheme("purple", true)).toBe("dark");
    expect(resolveInitialTheme("", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("toggles", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});
