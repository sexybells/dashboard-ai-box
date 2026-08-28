import { describe, expect, it } from "vitest";
import {
  extractFaceIdWindows,
  pickCameraTotal,
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
