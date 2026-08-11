import { describe, expect, it } from "vitest";
import { buildPlaybackStreamUrl } from "./camera-client";

describe("camera client helpers", () => {
  it("builds the playback proxy url with encoded start and duration", () => {
    const url = buildPlaybackStreamUrl("cam01", {
      start: new Date("2026-08-11T10:00:00.000Z"),
      durationSec: 90.5
    });
    expect(url).toBe(
      "/api/cameras/cam01/playback?start=2026-08-11T10%3A00%3A00.000Z&duration=90.5"
    );
  });

  it("url-encodes the camera code", () => {
    const url = buildPlaybackStreamUrl("cam/../01", {
      start: new Date("2026-08-11T10:00:00.000Z"),
      durationSec: 10
    });
    expect(url.startsWith("/api/cameras/cam%2F..%2F01/playback?")).toBe(true);
  });
});
