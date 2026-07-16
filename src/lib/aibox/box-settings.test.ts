import { describe, expect, it } from "vitest";
import { FALLBACK_BOX_HOST, normalizeBoxHost, resolveDefaultBoxHost } from "./box-settings";

describe("normalizeBoxHost", () => {
  it("assumes http for a bare host", () => {
    expect(normalizeBoxHost("192.168.1.26")).toBe("http://192.168.1.26");
  });

  it("keeps a valid scheme", () => {
    expect(normalizeBoxHost("https://box.local")).toBe("https://box.local");
  });

  it("keeps host:port, assuming http", () => {
    expect(normalizeBoxHost("192.168.1.26:8080")).toBe("http://192.168.1.26:8080");
    expect(normalizeBoxHost("box.local:8080")).toBe("http://box.local:8080");
  });

  it("strips trailing slash and path noise", () => {
    expect(normalizeBoxHost("http://192.168.1.26/")).toBe("http://192.168.1.26");
    expect(normalizeBoxHost("http://192.168.1.26/#/preview/video")).toBe("http://192.168.1.26");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeBoxHost("  192.168.1.26  ")).toBe("http://192.168.1.26");
  });

  it("rejects empty input", () => {
    expect(normalizeBoxHost("")).toBeNull();
    expect(normalizeBoxHost("   ")).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(normalizeBoxHost("ftp://192.168.1.26")).toBeNull();
    expect(normalizeBoxHost("javascript:alert(1)")).toBeNull();
    expect(normalizeBoxHost("javascript://alert")).toBeNull();
  });

  it("rejects unparseable input", () => {
    expect(normalizeBoxHost("http://")).toBeNull();
  });
});

describe("resolveDefaultBoxHost", () => {
  it("prefers AIBOX_HOST", () => {
    expect(resolveDefaultBoxHost({ AIBOX_HOST: "10.0.0.5", NEXT_PUBLIC_AIBOX_HOST: "10.0.0.9" })).toBe(
      "http://10.0.0.5"
    );
  });

  it("falls back to NEXT_PUBLIC_AIBOX_HOST for existing deploys", () => {
    expect(resolveDefaultBoxHost({ NEXT_PUBLIC_AIBOX_HOST: "10.0.0.9" })).toBe("http://10.0.0.9");
  });

  it("falls back to the LAN default when env is empty or invalid", () => {
    expect(resolveDefaultBoxHost({})).toBe(FALLBACK_BOX_HOST);
    expect(resolveDefaultBoxHost({ AIBOX_HOST: "ftp://nope" })).toBe(FALLBACK_BOX_HOST);
  });
});
