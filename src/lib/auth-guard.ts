import { getSafeRedirectPath } from "@/lib/auth";

type AuthRouteInput = {
  pathname: string;
  search: string;
  isAuthenticated: boolean;
};

export type AuthRouteDecision =
  | { type: "allow" }
  | { type: "redirect"; location: string }
  | { type: "unauthorized" };

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/webhooks/aibox" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export function getAuthRouteDecision({ pathname, search, isAuthenticated }: AuthRouteInput): AuthRouteDecision {
  if (pathname === "/login" && isAuthenticated) {
    return { type: "redirect", location: getSafeRedirectPath(new URLSearchParams(search).get("next")) };
  }

  if (isPublicPath(pathname) || isAuthenticated) {
    return { type: "allow" };
  }

  if (isApiPath(pathname)) {
    return { type: "unauthorized" };
  }

  const nextPath = `${pathname}${search}`;
  return { type: "redirect", location: `/login?next=${encodeURIComponent(nextPath)}` };
}
