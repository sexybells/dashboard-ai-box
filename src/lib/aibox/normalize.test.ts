import { describe, expect, it } from "vitest";
import { normalizeAiBoxAlarm } from "./normalize";

describe("normalizeAiBoxAlarm", () => {
  it("uses UniqueId as the dedupe key when present", () => {
    const result = normalizeAiBoxAlarm(
      {
        UniqueId: "ALARM_123",
        AlarmId: "ALARM-ID",
        TaskSession: "gate-in",
        Summary: "HeadCount",
        Result: { Description: "PeopleNumber" },
        Media: { MediaName: "camera-1", MediaUrl: "rtsp://camera-1" },
        Time: "2026-07-08 12:00:00",
        ImageData: "/9j/base64"
      },
      "hash-1"
    );

    expect(result.dedupeKey).toBe("unique:ALARM_123");
    expect(result.taskSession).toBe("gate-in");
    expect(result.summary).toBe("HeadCount");
    expect(result.description).toBe("PeopleNumber");
    expect(result.mediaName).toBe("camera-1");
    expect(result.imageKind).toBe("base64");
  });

  it("falls back to AlarmId and then payload hash for dedupe", () => {
    expect(normalizeAiBoxAlarm({ AlarmId: "ALARM-ID" }, "hash-1").dedupeKey).toBe(
      "alarm:ALARM-ID"
    );
    expect(normalizeAiBoxAlarm({}, "hash-1").dedupeKey).toBe("hash:hash-1");
  });

  it("detects AI Box image paths separately from base64 images", () => {
    const result = normalizeAiBoxAlarm(
      {
        ImageData: "Images/DAY_20260708/IMAGE_raw.jpg",
        LocalRawPath: "Images/DAY_20260708/IMAGE_raw.jpg"
      },
      "hash-1"
    );

    expect(result.imageKind).toBe("aibox-path");
    expect(result.imageOriginal).toBe("Images/DAY_20260708/IMAGE_raw.jpg");
  });
});
