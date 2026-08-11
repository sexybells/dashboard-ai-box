import { describe, expect, it } from "vitest";
import {
  computeTimelineSpans,
  findRangeAt,
  fracToTime,
  mergeRanges,
  parseRecordingRanges,
  resolvePlaybackWindow
} from "./recording-timeline";

const T0 = "2026-08-11T10:00:00.000Z";

function at(offsetSec: number): Date {
  return new Date(new Date(T0).getTime() + offsetSec * 1000);
}

// 2 segment 60s liền nhau (hở 0.5s do cắt file), 1 segment tách xa 10 phút.
const RAW = [
  { start: T0, duration: 60 },
  { start: at(60.5).toISOString(), duration: 60 },
  { start: at(720).toISOString(), duration: 60 }
];

describe("parseRecordingRanges", () => {
  it("parses, computes end, sorts by start", () => {
    const shuffled = [RAW[2], RAW[0], RAW[1]];
    const ranges = parseRecordingRanges(shuffled);
    expect(ranges).toHaveLength(3);
    expect(ranges[0].start.toISOString()).toBe(T0);
    expect(ranges[0].end.getTime()).toBe(at(60).getTime());
    expect(ranges[2].start.getTime()).toBe(at(720).getTime());
  });

  it("parses MediaMTX +07:00 offset timestamps", () => {
    const ranges = parseRecordingRanges([
      { start: "2026-08-11T17:11:35.212639+07:00", duration: 37.27 }
    ]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start.toISOString()).toBe("2026-08-11T10:11:35.212Z");
  });

  it("drops invalid entries instead of throwing", () => {
    const ranges = parseRecordingRanges([
      { start: "not-a-date", duration: 60 },
      { start: T0, duration: 0 },
      { start: T0, duration: -5 },
      { start: T0, duration: NaN },
      ...RAW
    ]);
    expect(ranges).toHaveLength(3);
  });
});

describe("mergeRanges", () => {
  it("merges contiguous segments within tolerance, keeps distant ones apart", () => {
    const merged = mergeRanges(parseRecordingRanges(RAW));
    expect(merged).toHaveLength(2);
    // Khoảng đầu = 2 segment hàn lại: T0 → 120.5s.
    expect(merged[0].start.toISOString()).toBe(T0);
    expect(merged[0].end.getTime()).toBe(at(120.5).getTime());
    expect(merged[0].durationSec).toBeCloseTo(120.5);
    expect(merged[1].start.getTime()).toBe(at(720).getTime());
  });

  it("handles overlapping ranges without shrinking", () => {
    const merged = mergeRanges(
      parseRecordingRanges([
        { start: T0, duration: 100 },
        { start: at(50).toISOString(), duration: 20 } // nằm gọn trong khoảng đầu
      ])
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].end.getTime()).toBe(at(100).getTime());
  });

  it("merges at exactly the tolerance boundary, splits just past it", () => {
    // Hở đúng MERGE_TOLERANCE_SEC (2s) → vẫn hàn; quá 1ms → tách.
    const atBoundary = mergeRanges(
      parseRecordingRanges([
        { start: T0, duration: 60 },
        { start: at(62).toISOString(), duration: 60 }
      ])
    );
    expect(atBoundary).toHaveLength(1);
    const pastBoundary = mergeRanges(
      parseRecordingRanges([
        { start: T0, duration: 60 },
        { start: at(62.001).toISOString(), duration: 60 }
      ])
    );
    expect(pastBoundary).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const ranges = parseRecordingRanges(RAW);
    const endBefore = ranges[0].end.getTime();
    mergeRanges(ranges);
    expect(ranges[0].end.getTime()).toBe(endBefore);
    expect(ranges).toHaveLength(3);
  });

  it("returns empty for empty input", () => {
    expect(mergeRanges([])).toEqual([]);
  });
});

describe("resolvePlaybackWindow", () => {
  const merged = mergeRanges(parseRecordingRanges(RAW));

  it("plays from the exact target to the end of the contiguous span", () => {
    const win = resolvePlaybackWindow(merged, at(30));
    expect(win).not.toBeNull();
    expect(win!.start.getTime()).toBe(at(30).getTime());
    expect(win!.durationSec).toBeCloseTo(90.5); // 120.5 - 30
  });

  it("snaps to the next range when target falls in a gap", () => {
    const win = resolvePlaybackWindow(merged, at(300));
    expect(win!.start.getTime()).toBe(at(720).getTime());
    expect(win!.durationSec).toBeCloseTo(60);
  });

  it("snaps to the first range when target is before all recordings", () => {
    const win = resolvePlaybackWindow(merged, at(-100));
    expect(win!.start.toISOString()).toBe(T0);
  });

  it("returns null when target is after all recordings", () => {
    expect(resolvePlaybackWindow(merged, at(10000))).toBeNull();
    expect(resolvePlaybackWindow([], at(0))).toBeNull();
  });
});

describe("findRangeAt", () => {
  const merged = mergeRanges(parseRecordingRanges(RAW));
  it("end is exclusive", () => {
    expect(findRangeAt(merged, at(120.5))).toBeUndefined();
    expect(findRangeAt(merged, at(120.4))).toBe(merged[0]);
  });

  it("start is inclusive", () => {
    expect(findRangeAt(merged, at(0))).toBe(merged[0]);
    expect(findRangeAt(merged, at(720))).toBe(merged[1]);
  });
});

describe("computeTimelineSpans", () => {
  const merged = mergeRanges(parseRecordingRanges(RAW));

  it("projects ranges onto the view window as fractions", () => {
    // Cửa sổ nhìn 0..780s → khoảng 1: 0..120.5/780, khoảng 2: 720/780..1.
    const spans = computeTimelineSpans(merged, at(0), at(780));
    expect(spans).toHaveLength(2);
    expect(spans[0].offsetFrac).toBeCloseTo(0);
    expect(spans[0].widthFrac).toBeCloseTo(120.5 / 780);
    expect(spans[1].offsetFrac).toBeCloseTo(720 / 780);
    expect(spans[1].widthFrac).toBeCloseTo(60 / 780);
  });

  it("clips ranges that overflow the view and drops ones outside", () => {
    const spans = computeTimelineSpans(merged, at(60), at(120));
    expect(spans).toHaveLength(1);
    expect(spans[0].offsetFrac).toBeCloseTo(0);
    expect(spans[0].widthFrac).toBeCloseTo(1);
  });

  it("returns empty for an inverted view window", () => {
    expect(computeTimelineSpans(merged, at(100), at(0))).toEqual([]);
  });
});

describe("fracToTime", () => {
  it("maps fractions to times and clamps outside 0..1", () => {
    expect(fracToTime(0.5, at(0), at(100)).getTime()).toBe(at(50).getTime());
    expect(fracToTime(-1, at(0), at(100)).getTime()).toBe(at(0).getTime());
    expect(fracToTime(2, at(0), at(100)).getTime()).toBe(at(100).getTime());
  });
});
