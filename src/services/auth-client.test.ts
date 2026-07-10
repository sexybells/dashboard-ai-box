import { afterEach, describe, expect, it, vi } from "vitest";
import { login, logout } from "./auth-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("auth client", () => {
  it("posts login credentials and returns the username", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, username: "admin" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    globalThis.fetch = fetchMock;

    await expect(login({ username: "admin", password: "123456" })).resolves.toEqual({
      ok: true,
      username: "admin"
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "123456" })
    });
  });

  it("throws the server login error message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Tên đăng nhập hoặc mật khẩu không đúng" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(login({ username: "admin", password: "wrong" })).rejects.toThrow(
      "Tên đăng nhập hoặc mật khẩu không đúng"
    );
  });

  it("posts logout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock;

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
});
