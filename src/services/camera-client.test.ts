import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPlaybackStreamUrl,
  fetchCameraLiveUrls,
  fetchCameras,
  fetchRecordingRanges
} from "./camera-client";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body)
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("camera client fetchers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchCameras unwraps the cameras array", async () => {
    const cams = [{ code: "cam01", name: "Camera cổng chính", location: "", online: true }];
    const fn = mockFetchOnce({ ok: true, cameras: cams });
    await expect(fetchCameras()).resolves.toEqual(cams);
    expect(fn).toHaveBeenCalledWith("/api/cameras", { cache: "no-store" });
  });

  it("fetchCameraLiveUrls unwraps hls + webrtc + auth", async () => {
    mockFetchOnce({
      ok: true,
      hls: "http://h/x.m3u8",
      webrtc: "http://w/whep",
      auth: { user: "viewer", pass: "x" }
    });
    await expect(fetchCameraLiveUrls("cam01")).resolves.toEqual({
      hls: "http://h/x.m3u8",
      webrtc: "http://w/whep",
      auth: { user: "viewer", pass: "x" }
    });
  });

  it("fetchCameraLiveUrls defaults auth to null when the API omits it", async () => {
    mockFetchOnce({ ok: true, hls: "http://h/x.m3u8", webrtc: "http://w/whep" });
    const live = await fetchCameraLiveUrls("cam01");
    expect(live.auth).toBeNull();
  });

  it("fetchRecordingRanges unwraps ranges and sends the window as ISO params", async () => {
    const fn = mockFetchOnce({ ok: true, ranges: [{ start: "2026-08-11T10:00:00Z", duration: 60 }] });
    const ranges = await fetchRecordingRanges("cam01", {
      from: new Date("2026-08-11T00:00:00.000Z"),
      to: new Date("2026-08-12T00:00:00.000Z")
    });
    expect(ranges).toEqual([{ start: "2026-08-11T10:00:00Z", duration: 60 }]);
    expect(fn.mock.calls[0][0]).toBe(
      "/api/cameras/cam01/recordings?from=2026-08-11T00%3A00%3A00.000Z&to=2026-08-12T00%3A00%3A00.000Z"
    );
  });

  it("fetchers throw on non-OK responses", async () => {
    mockFetchOnce({ ok: false }, false, 502);
    await expect(fetchCameras()).rejects.toThrow("502");
  });
});

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
