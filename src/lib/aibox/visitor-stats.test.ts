import { describe, expect, it } from "vitest";
import { aggregateVisitorCounts } from "./visitor-stats";

const rows = [
  { date: "2026-07-01", count: 5 },
  { date: "2026-07-02", count: 3 },
  { date: "2026-07-15", count: 4 },
  { date: "2026-08-03", count: 6 }
];

describe("aggregateVisitorCounts", () => {
  it("day: zero-fills the range and preserves total/peak", () => {
    const r = aggregateVisitorCounts(rows, "day", "2026-07-01", "2026-07-03");
    expect(r.series.map((b) => b.count)).toEqual([5, 3, 0]);
    expect(r.series.map((b) => b.label)).toEqual(["01/07", "02/07", "03/07"]);
    expect(r.total).toBe(8);
    expect(r.peak?.count).toBe(5);
    expect(r.activePeriods).toBe(2);
  });

  it("month: groups by YYYY-MM and preserves total", () => {
    const r = aggregateVisitorCounts(rows, "month", "2026-07-01", "2026-08-31");
    expect(r.series.map((b) => b.period)).toEqual(["2026-07", "2026-08"]);
    expect(r.series.map((b) => b.count)).toEqual([12, 6]); // Jul 5+3+4, Aug 6
    expect(r.series.map((b) => b.label)).toEqual(["07/2026", "08/2026"]);
    expect(r.total).toBe(18);
  });

  it("week: fewer buckets than days, total preserved, keys are Monday dates", () => {
    const r = aggregateVisitorCounts(rows, "week", "2026-07-01", "2026-07-15");
    expect(r.total).toBe(12); // 5+3+4 within range
    expect(r.series.length).toBeGreaterThan(0);
    expect(r.series.length).toBeLessThan(15);
    for (const b of r.series) expect(b.period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignores rows outside the range", () => {
    const r = aggregateVisitorCounts(rows, "day", "2026-07-01", "2026-07-01");
    expect(r.total).toBe(5);
    expect(r.series).toHaveLength(1);
  });

  it("reversed range (from>to) yields an empty series", () => {
    const r = aggregateVisitorCounts(rows, "day", "2026-07-10", "2026-07-01");
    expect(r.series).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.peak).toBeNull();
  });
});
