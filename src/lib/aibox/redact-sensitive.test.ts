import { describe, expect, it } from "vitest";
import { REDACTED, redactSensitive } from "./redact-sensitive";

describe("redactSensitive", () => {
  it("removes an RTSP url carrying camera credentials", () => {
    // Real shape from the box: user:pass embedded in the stream url.
    expect(redactSensitive("rtsp://FPT_AI:secret@113.161.80.174:3001/Streaming/Channels/101")).toBe(REDACTED);
  });

  it("removes bare IPv4 addresses and host:port pairs", () => {
    expect(redactSensitive("192.168.1.26")).toBe(REDACTED);
    expect(redactSensitive("http://192.168.100.21:8080")).toBe(REDACTED);
  });

  it("keeps values that carry no address", () => {
    expect(redactSensitive("2C_T1_BAR_01")).toBe("2C_T1_BAR_01");
    expect(redactSensitive("Smoking")).toBe("Smoking");
    expect(redactSensitive("2026-08-28 14:20:32")).toBe("2026-08-28 14:20:32");
  });

  it("walks nested objects and arrays", () => {
    const raw = {
      BoardIp: "192.168.1.26",
      Summary: "Smoking",
      Media: { MediaName: "2C_T1_BAR_01", MediaUrl: "rtsp://u:p@1.2.3.4:554/s", MediaWidth: 1920 },
      Extras: [{ url: "rtsp://u:p@1.2.3.4:554/s" }, { note: "ok" }]
    };

    expect(redactSensitive(raw)).toEqual({
      BoardIp: REDACTED,
      Summary: "Smoking",
      Media: { MediaName: "2C_T1_BAR_01", MediaUrl: REDACTED, MediaWidth: 1920 },
      Extras: [{ url: REDACTED }, { note: "ok" }]
    });
  });

  it("leaves the detection coordinates untouched", () => {
    const result = { RelativeBox: [0.35, 0.19, 0.12, 0.39], Cropped: false, Description: "Smoking" };
    expect(redactSensitive(result)).toEqual(result);
  });

  it("passes through non-string primitives", () => {
    expect(redactSensitive(1920)).toBe(1920);
    expect(redactSensitive(true)).toBe(true);
    expect(redactSensitive(null)).toBeNull();
  });

  it("does not mutate the input", () => {
    const raw = { BoardIp: "192.168.1.26" };
    redactSensitive(raw);
    expect(raw.BoardIp).toBe("192.168.1.26");
  });
});
