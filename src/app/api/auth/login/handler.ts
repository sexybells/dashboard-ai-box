import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  createSessionCookieValue,
  validateCredentials
} from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function handleLoginRequest(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu đăng nhập không hợp lệ" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dữ liệu đăng nhập không hợp lệ" }, { status: 400 });
  }

  const username = parsed.data.username.trim();
  if (!validateCredentials(username, parsed.data.password)) {
    return NextResponse.json({ ok: false, error: "Tên đăng nhập hoặc mật khẩu không đúng" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, username });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: await createSessionCookieValue(username),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/"
  });

  return response;
}
