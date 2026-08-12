import { describe, expect, it } from "vitest";
import {
  buildTranscodeCommand,
  isValidCameraCode,
  nextCameraCode,
  normalizeRtspUrl
} from "./cameras";

describe("isValidCameraCode", () => {
  it("accepts server-generated codes and rejects everything else", () => {
    expect(isValidCameraCode("cam01")).toBe(true);
    expect(isValidCameraCode("cam123")).toBe(true);
    expect(isValidCameraCode("cam1")).toBe(false);
    expect(isValidCameraCode("CAM01")).toBe(false);
    expect(isValidCameraCode("cam01/../x")).toBe(false);
    expect(isValidCameraCode("")).toBe(false);
  });
});

describe("nextCameraCode", () => {
  it("starts at cam01 and takes max+1", () => {
    expect(nextCameraCode([])).toBe("cam01");
    expect(nextCameraCode(["cam01", "cam02"])).toBe("cam03");
  });

  it("does not refill deleted holes (recordings on disk keep the old path name)", () => {
    expect(nextCameraCode(["cam01", "cam05"])).toBe("cam06");
  });

  it("ignores foreign codes and pads to two digits", () => {
    expect(nextCameraCode(["lobby", "cam09"])).toBe("cam10");
  });
});

describe("normalizeRtspUrl", () => {
  it("accepts rtsp/rtsps with credentials and normalizes", () => {
    expect(normalizeRtspUrl(" rtsp://admin:pw@192.168.1.10:554/ch1 ")).toBe(
      "rtsp://admin:pw@192.168.1.10:554/ch1"
    );
    expect(normalizeRtspUrl("rtsps://cam.example.com/stream")).toBe(
      "rtsps://cam.example.com/stream"
    );
  });

  it("rejects non-rtsp schemes and unparsable input", () => {
    expect(normalizeRtspUrl("http://x.com/a")).toBeNull();
    expect(normalizeRtspUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeRtspUrl("not a url")).toBeNull();
    expect(normalizeRtspUrl("")).toBeNull();
    expect(normalizeRtspUrl("rtsp://")).toBeNull();
  });

  it("rejects shell metacharacters (URL goes into a shell command)", () => {
    // Nháy đơn là ký tự duy nhất thoát được chuỗi bọc nháy đơn — cấm tuyệt đối.
    expect(normalizeRtspUrl("rtsp://h/x'y")).toBeNull();
    expect(normalizeRtspUrl('rtsp://h/x"y')).toBeNull();
    expect(normalizeRtspUrl("rtsp://h/x`id`")).toBeNull();
    expect(normalizeRtspUrl("rtsp://h/x$PATH")).toBeNull();
    expect(normalizeRtspUrl("rtsp://h/x\\y")).toBeNull();
    expect(normalizeRtspUrl("rtsp://h/a b")).toBeNull();
    expect(normalizeRtspUrl("rtsp://h/a\nb")).toBeNull();
  });
});

describe("buildTranscodeCommand", () => {
  it("wraps the url in single quotes and keeps MediaMTX env placeholders", () => {
    const cmd = buildTranscodeCommand("rtsp://admin:pw@10.0.0.5:554/main");
    expect(cmd).toContain("-i 'rtsp://admin:pw@10.0.0.5:554/main'");
    expect(cmd).toContain("-timeout 15000000");
    expect(cmd).toContain("libx264");
    expect(cmd).toContain("rtsp://localhost:$RTSP_PORT/$MTX_PATH");
    expect(cmd).toContain("-an");
  });

  it("switches encoder for macOS dev", () => {
    expect(buildTranscodeCommand("rtsp://h/s", "h264_videotoolbox")).toContain("h264_videotoolbox");
  });
});
