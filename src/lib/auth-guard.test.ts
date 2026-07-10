import { describe, expect, it } from "vitest";
import { getAuthRouteDecision } from "./auth-guard";

describe("getAuthRouteDecision", () => {
  it("allows public auth and webhook routes without a session", () => {
    expect(getAuthRouteDecision({ pathname: "/login", search: "", isAuthenticated: false })).toEqual({ type: "allow" });
    expect(getAuthRouteDecision({ pathname: "/api/auth/login", search: "", isAuthenticated: false })).toEqual({
      type: "allow"
    });
    expect(getAuthRouteDecision({ pathname: "/api/webhooks/aibox", search: "", isAuthenticated: false })).toEqual({
      type: "allow"
    });
  });

  it("redirects unauthenticated page requests to login with a safe next path", () => {
    expect(getAuthRouteDecision({ pathname: "/alarms", search: "?page=2", isAuthenticated: false })).toEqual({
      type: "redirect",
      location: "/login?next=%2Falarms%3Fpage%3D2"
    });
  });

  it("returns 401 for unauthenticated protected API requests", () => {
    expect(getAuthRouteDecision({ pathname: "/api/alarms", search: "?limit=1", isAuthenticated: false })).toEqual({
      type: "unauthorized"
    });
  });

  it("redirects authenticated users away from login", () => {
    expect(getAuthRouteDecision({ pathname: "/login", search: "?next=%2Fanalytics", isAuthenticated: true })).toEqual({
      type: "redirect",
      location: "/analytics"
    });
  });
});
