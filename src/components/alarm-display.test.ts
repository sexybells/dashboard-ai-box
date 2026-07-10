import { describe, expect, it } from "vitest";
import {
  formatAlarmDate,
  formatAlarmTime,
  formatUnknown,
  getAlarmListEmptyMessage,
  getRealtimeStatusLabel
} from "./alarm-display";

describe("alarm display helpers", () => {
  it("formats valid alarm dates with Vietnamese locale", () => {
    expect(formatAlarmDate("2026-07-09T03:04:05.000Z")).toMatch(/09\/07\/2026/);
  });

  it("keeps the original AI Box alarm time text ahead of parsed ISO time", () => {
    expect(formatAlarmTime("2026-07-09T10:59:17.000Z", "2026-07-09 10:59:17")).toBe(
      "2026-07-09 10:59:17"
    );
  });

  it("keeps invalid dates readable", () => {
    expect(formatAlarmDate("camera-time-text")).toBe("camera-time-text");
  });

  it("uses a dash for missing dates and unknown values", () => {
    expect(formatAlarmDate()).toBe("-");
    expect(formatUnknown()).toBe("-");
    expect(formatUnknown(null)).toBe("-");
  });

  it("returns Vietnamese realtime status labels", () => {
    expect(getRealtimeStatusLabel("live")).toBe("Đang trực tuyến");
    expect(getRealtimeStatusLabel("offline")).toBe("Mất kết nối");
    expect(getRealtimeStatusLabel("connecting")).toBe("Đang kết nối");
  });

  it("returns distinct empty-state messages for database and filters", () => {
    expect(getAlarmListEmptyMessage(false)).toContain("Chưa có cảnh báo");
    expect(getAlarmListEmptyMessage(true)).toContain("Không có cảnh báo phù hợp");
  });
});
