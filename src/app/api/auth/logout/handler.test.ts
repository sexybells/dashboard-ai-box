import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { handleLogoutRequest } from "./handler";

describe("handleLogoutRequest", () => {
  it("clears the session cookie", async () => {
    const response = handleLogoutRequest(new NextRequest("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_COOKIE_NAME}=;`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
