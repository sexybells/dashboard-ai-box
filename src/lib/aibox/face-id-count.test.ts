import { describe, expect, it } from "vitest";
import {
  extractFaceIdWindows,
  pickCameraTotal,
  summarizePeriods,
  totalFromSnapshots,
  type CameraFaceCount
} from "./face-id-count";

function payload(value: unknown) {
  return { Result: { Properties: [{ property: "FaceIdCount", type: "json", value }] } };
}

describe("extractFaceIdWindows", () => {
  it("reads the windows out of a real FaceIdCount payload", () => {
    expect(
      extractFaceIdWindows(
        payload([
          { Count: 3, End: 9, Start: 6 },
          { Count: 5, End: 13, Start: 10 }
        ])
      )
    ).toEqual([
      { start: 6, end: 9, count: 3 },
      { start: 10, end: 13, count: 5 }
    ]);
  });

  it("returns [] for payloads that are not FaceIdCount events", () => {
    expect(extractFaceIdWindows({ Result: { Count: [1, 0], Description: "In" } })).toEqual([]);
    expect(extractFaceIdWindows({})).toEqual([]);
    expect(extractFaceIdWindows(null)).toEqual([]);
  });

  it("defaults a missing Count to 0 but drops windows without hours", () => {
    expect(extractFaceIdWindows(payload([{ Start: 1, End: 23 }, { Count: 4 }]))).toEqual([
      { start: 1, end: 23, count: 0 }
    ]);
  });
});

describe("totalFromSnapshots", () => {
  it("keeps the per-window max instead of summing repeated heartbeats", () => {
    // The box resends the same cumulative window every ~60s; summing would
    // multiply the real count by the number of heartbeats.
    const beat = [{ start: 1, end: 23, count: 7 }];
    expect(totalFromSnapshots([beat, beat, beat]).total).toBe(7);
  });

  it("adds disjoint windows together", () => {
    expect(
      totalFromSnapshots([
        [
          { start: 6, end: 9, count: 2 },
          { start: 10, end: 13, count: 4 }
        ]
      ]).total
    ).toBe(6);
  });

  it("survives a window resetting to 0 after it closes", () => {
    const { total, windows } = totalFromSnapshots([
      [{ start: 6, end: 9, count: 8 }],
      [{ start: 6, end: 9, count: 0 }]
    ]);
    expect(total).toBe(8);
    expect(windows).toEqual([{ start: 6, end: 9, count: 8 }]);
  });

  it("returns 0 with no snapshots", () => {
    expect(totalFromSnapshots([])).toEqual({ total: 0, windows: [] });
  });
});

describe("pickCameraTotal", () => {
  const cameras: CameraFaceCount[] = [
    { camera: "Tam Quan Nội - Ngoài", total: 4, windows: [] },
    { camera: "Mới - Tam Quan Nội - Sân", total: 9, windows: [] }
  ];

  it("uses the preferred camera when it has data", () => {
    expect(pickCameraTotal(cameras, "Tam Quan Nội - Ngoài")?.total).toBe(4);
  });

  it("falls back to the highest total, never the sum", () => {
    // 4 + 9 would double count the visitors both cameras saw.
    expect(pickCameraTotal(cameras)?.total).toBe(9);
    expect(pickCameraTotal(cameras, "camera-khong-ton-tai")?.total).toBe(9);
  });

  it("returns null when no camera reported", () => {
    expect(pickCameraTotal([])).toBeNull();
  });
});

describe("summarizePeriods", () => {
  // Two cameras seeing the same visitors, across four days spanning a week,
  // month and year boundary. today = Fri 2026-08-28 (ISO week Mon 24 → Sun 30).
  const rows = [
    { day: "2025-12-31", camera: "Sân", total: 4 }, // nam truoc
    { day: "2026-07-30", camera: "Sân", total: 5 }, // thang truoc
    { day: "2026-08-24", camera: "Sân", total: 6 }, // dau tuan nay
    { day: "2026-08-28", camera: "Sân", total: 9 }, // hom nay
    { day: "2026-08-28", camera: "Ngoài", total: 7 } // cung hom nay, cam khac
  ];

  it("adds days but never adds cameras on the same day", () => {
    const { periods } = summarizePeriods(rows, "2026-08-28");
    // hom nay = 9 (max cua 9 va 7), KHONG phai 16
    expect(periods.today).toBe(9);
    expect(periods.week).toBe(6 + 9);
    expect(periods.month).toBe(6 + 9);
    expect(periods.year).toBe(5 + 6 + 9);
    expect(periods.all).toBe(4 + 5 + 6 + 9);
  });

  it("honours the pinned camera per day", () => {
    const { periods, todayCamera } = summarizePeriods(rows, "2026-08-28", "Ngoài");
    expect(periods.today).toBe(7);
    expect(todayCamera).toBe("Ngoài");
  });

  it("keeps one row per day, sorted, and names today's source camera", () => {
    const { byDay, todayCamera } = summarizePeriods(rows, "2026-08-28");
    expect(byDay.map((d) => d.day)).toEqual([
      "2025-12-31",
      "2026-07-30",
      "2026-08-24",
      "2026-08-28"
    ]);
    expect(todayCamera).toBe("Sân");
  });

  it("returns zeros with no rows", () => {
    const { periods, todayCamera } = summarizePeriods([], "2026-08-28");
    expect(periods).toEqual({ today: 0, week: 0, month: 0, year: 0, all: 0 });
    expect(todayCamera).toBeNull();
  });

  it("excludes days outside the ISO week", () => {
    // Sun 2026-08-23 is the previous week; Mon 2026-08-24 starts this one.
    const { periods } = summarizePeriods(
      [
        { day: "2026-08-23", camera: "Sân", total: 3 },
        { day: "2026-08-24", camera: "Sân", total: 2 }
      ],
      "2026-08-28"
    );
    expect(periods.week).toBe(2);
    expect(periods.month).toBe(5);
  });
});
