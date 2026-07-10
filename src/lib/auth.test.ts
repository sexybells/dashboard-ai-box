import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionCookieValue,
  getSafeRedirectPath,
  readSessionCookie,
  validateCredentials
} from "./auth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("auth credentials", () => {
  it("accepts the default admin credentials", () => {
    delete process.env.AIBOX_ADMIN_USERNAME;
    delete process.env.AIBOX_ADMIN_PASSWORD;

    expect(validateCredentials("admin", "123456")).toBe(true);
  });

  it("rejects invalid credentials", () => {
    expect(validateCredentials("admin", "wrong-password")).toBe(false);
    expect(validateCredentials("guest", "123456")).toBe(false);
  });
});

describe("session cookie", () => {
  it("creates and verifies a signed session", async () => {
    const now = Date.UTC(2026, 6, 10, 10, 0, 0);

    const cookieValue = await createSessionCookieValue("admin", now);
    const session = await readSessionCookie(cookieValue, now);

    expect(session).toMatchObject({ username: "admin" });
    expect(session?.expiresAt).toBeGreaterThan(now);
  });

  it("rejects tampered or expired sessions", async () => {
    const now = Date.UTC(2026, 6, 10, 10, 0, 0);
    const cookieValue = await createSessionCookieValue("admin", now);

    expect(await readSessionCookie(`${cookieValue}tampered`, now)).toBeNull();
    expect(await readSessionCookie(cookieValue, now + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});

describe("safe redirect paths", () => {
  it("allows internal paths and rejects external redirects", () => {
    expect(getSafeRedirectPath("/alarms?limit=1")).toBe("/alarms?limit=1");
    expect(getSafeRedirectPath("https://evil.example")).toBe("/");
    expect(getSafeRedirectPath("//evil.example")).toBe("/");
    expect(getSafeRedirectPath("/login")).toBe("/");
  });
});
