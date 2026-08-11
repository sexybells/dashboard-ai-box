import { describe, expect, it } from "vitest";
import { CAMERAS, getCamera, isKnownCameraCode } from "./cameras";

describe("cameras config", () => {
  it("has at least one camera with valid path-safe codes", () => {
    expect(CAMERAS.length).toBeGreaterThan(0);
    for (const cam of CAMERAS) {
      // Code phải path-safe để ghép thẳng vào URL MediaMTX không cần encode.
      expect(cam.code).toMatch(/^[a-z0-9_-]+$/);
      expect(cam.name.trim()).not.toBe("");
    }
  });

  it("has unique codes", () => {
    const codes = CAMERAS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("getCamera returns the config for a known code", () => {
    const first = CAMERAS[0];
    expect(getCamera(first.code)).toEqual(first);
  });

  it("getCamera returns undefined for unknown codes", () => {
    expect(getCamera("nope")).toBeUndefined();
    expect(getCamera("")).toBeUndefined();
  });

  it("isKnownCameraCode acts as an allowlist", () => {
    expect(isKnownCameraCode(CAMERAS[0].code)).toBe(true);
    expect(isKnownCameraCode("../etc/passwd")).toBe(false);
    expect(isKnownCameraCode("cam01/../secret")).toBe(false);
  });
});
