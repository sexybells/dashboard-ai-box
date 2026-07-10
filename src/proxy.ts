import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, readSessionCookie } from "@/lib/auth";
import { getAuthRouteDecision } from "@/lib/auth-guard";

export async function proxy(request: NextRequest) {
  const session = await readSessionCookie(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const decision = getAuthRouteDecision({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    isAuthenticated: Boolean(session)
  });

  if (decision.type === "allow") {
    return NextResponse.next();
  }

  if (decision.type === "unauthorized") {
    return NextResponse.json({ ok: false, error: "Vui lòng đăng nhập để tiếp tục" }, { status: 401 });
  }

  return NextResponse.redirect(new URL(decision.location, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
