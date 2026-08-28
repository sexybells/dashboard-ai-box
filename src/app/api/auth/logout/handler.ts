import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isRequestSecure } from "@/lib/auth";

export function handleLogoutRequest(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isRequestSecure(request),
    sameSite: "lax",
    maxAge: 0,
    path: "/"
  });
  return response;
}
