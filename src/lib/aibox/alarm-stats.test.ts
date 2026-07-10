import { describe, expect, it } from "vitest";
import { byHour, computeStats, countBy, dateKey, hourOf, perDay, type StatInput } from "@/lib/aibox/alarm-stats";

const sample: StatInput[] = [
  { timeText: "2026-07-10 09:15:00", mediaName: "Cam A", summary: "Người lạ" },
  { timeText: "2026-07-10 09:45:00", mediaName: "Cam A", summary: "Người lạ" },
  { timeText: "2026-07-10 23:05:00", mediaName: "Cam B", summary: "Cháy" },
  { timeText: "2026-07-09 08:00:00", mediaName: "Cam A", summary: "Cháy" },
  { time: new Date("2026-07-08T02:30:00Z"), mediaName: "Cam C", summary: "Người lạ" }
];

describe("dateKey", () => {
  it("prefers original timeText over parsed time (no +7h drift)", () => {
    // 2026-07-09 23:00 local must stay on the 9th, not roll to the 10th via UTC.
    expect(dateKey("2026-07-09 23:00:00", new Date("2026-07-09T16:00:00Z"))).toBe("2026-07-09");
  });
  it("falls back to Date when no timeText", () => {
    expect(dateKey(undefined, new Date("2026-07-08T02:30:00Z"))).toBe("2026-07-08");
  });
  it("returns null for junk", () => {
    expect(dateKey("not a date", undefined)).toBeNull();
  });
});

describe("hourOf", () => {
  it("reads the hour from timeText", () => {
    expect(hourOf("2026-07-10 23:05:00")).toBe(23);
    expect(hourOf("2026-07-10 09:15:00")).toBe(9);
  });
});

describe("countBy", () => {
  it("counts and sorts desc, top N", () => {
    expect(countBy(sample, "mediaName")).toEqual([
      { name: "Cam A", count: 3 },
      { name: "Cam B", count: 1 },
      { name: "Cam C", count: 1 }
    ]);
  });
  it("respects topN", () => {
    expect(countBy(sample, "summary", 1)).toEqual([{ name: "Người lạ", count: 3 }]);
  });
});

describe("perDay", () => {
  it("zero-fills the range ending at todayKey", () => {
    const buckets = perDay(sample, "2026-07-10", 3);
    expect(buckets).toEqual([
      { date: "2026-07-08", count: 1 },
      { date: "2026-07-09", count: 1 },
      { date: "2026-07-10", count: 3 }
    ]);
  });
});

describe("byHour", () => {
  it("buckets by hour", () => {
    const hours = byHour(sample);
    expect(hours[9]).toBe(2);
    expect(hours[23]).toBe(1);
    expect(hours.length).toBe(24);
  });
});

describe("computeStats", () => {
  it("handles empty input", () => {
    const stats = computeStats([], "2026-07-10", 7);
    expect(stats.total).toBe(0);
    expect(stats.today).toBe(0);
    expect(stats.byCamera).toEqual([]);
    expect(stats.perDay).toHaveLength(7);
    expect(stats.byHour).toHaveLength(24);
  });
  it("computes today from timeText", () => {
    const stats = computeStats(sample, "2026-07-10");
    expect(stats.total).toBe(5);
    expect(stats.today).toBe(3);
  });
});
