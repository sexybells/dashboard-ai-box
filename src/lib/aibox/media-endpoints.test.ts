import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MEDIAMTX_API_URL,
  DEFAULT_MEDIA_HLS_BASE,
  buildHlsLiveUrl,
  buildPlaybackGetUrl,
  buildPlaybackListUrl,
  buildWhepUrl,
  mediamtxApiUrl,
  publicHlsBase,
  toRfc3339
} from "./media-endpoints";

describe("media-endpoints", () => {
  afterEach(() => {
    delete process.env.MEDIAMTX_API_URL;
  });

  it("builds HLS live url", () => {
    expect(buildHlsLiveUrl("http://localhost:8888", "cam01")).toBe(
      "http://localhost:8888/cam01/index.m3u8"
    );
  });

  it("strips trailing slashes from bases", () => {
    expect(buildHlsLiveUrl("http://media.example.com/", "cam01")).toBe(
      "http://media.example.com/cam01/index.m3u8"
    );
    expect(buildWhepUrl("http://localhost:8889//", "cam01")).toBe(
      "http://localhost:8889/cam01/whep"
    );
  });

  it("formats RFC3339 timestamps MediaMTX accepts", () => {
    const d = new Date("2026-08-11T10:11:35.212Z");
    expect(toRfc3339(d)).toBe("2026-08-11T10:11:35.212Z");
  });

  it("builds /list url with url-encoded range", () => {
    const url = buildPlaybackListUrl("http://127.0.0.1:9996", {
      path: "cam01",
      start: new Date("2026-08-11T00:00:00.000Z"),
      end: new Date("2026-08-11T23:59:59.000Z")
    });
    expect(url).toBe(
      "http://127.0.0.1:9996/list?path=cam01&start=2026-08-11T00%3A00%3A00.000Z&end=2026-08-11T23%3A59%3A59.000Z"
    );
  });

  it("builds /list url without range", () => {
    expect(buildPlaybackListUrl("http://127.0.0.1:9996", { path: "cam01" })).toBe(
      "http://127.0.0.1:9996/list?path=cam01"
    );
  });

  it("builds /get url with duration and format", () => {
    const url = buildPlaybackGetUrl("http://127.0.0.1:9996", {
      path: "cam01",
      start: new Date("2026-08-11T10:00:00.000Z"),
      duration: 120.5,
      format: "mp4"
    });
    expect(url).toBe(
      "http://127.0.0.1:9996/get?path=cam01&start=2026-08-11T10%3A00%3A00.000Z&duration=120.5&format=mp4"
    );
  });

  it("env accessors fall back to defaults and honor overrides", () => {
    expect(mediamtxApiUrl()).toBe(DEFAULT_MEDIAMTX_API_URL);
    process.env.MEDIAMTX_API_URL = "http://10.0.0.2:9997/";
    expect(mediamtxApiUrl()).toBe("http://10.0.0.2:9997");
    // NEXT_PUBLIC_* không set trong test env → default.
    expect(publicHlsBase()).toBe(DEFAULT_MEDIA_HLS_BASE);
  });
});
