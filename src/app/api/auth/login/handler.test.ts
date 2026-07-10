import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { handleLoginRequest } from "./handler";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" }
  });
}

describe("handleLoginRequest", () => {
  it("sets a session cookie for valid credentials", async () => {
    const response = await handleLoginRequest(makeRequest({ username: "admin", password: "123456" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_COOKIE_NAME}=`);
    await expect(response.json()).resolves.toEqual({ ok: true, username: "admin" });
  });

  it("rejects invalid credentials", async () => {
    const response = await handleLoginRequest(makeRequest({ username: "admin", password: "wrong" }));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Tên đăng nhập hoặc mật khẩu không đúng"
    });
  });
});
