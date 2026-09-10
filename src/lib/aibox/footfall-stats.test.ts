import { describe, expect, it } from "vitest";
import { aggregateFootfall, resolveEventDelta, type FootfallEvent } from "./footfall-stats";

describe("resolveEventDelta", () => {
  const camMap = { "check-in": "in", "check-out": "out" } as const;

  it("mapped camera counts by camera, ignoring event Direction", () => {
    // Exit camera event that the box mislabeled In (Count=[1,0]) → still counts as out.
    expect(resolveEventDelta({ mediaName: "check-out", count: [1, 0], direction: 1 }, camMap)).toEqual({ in: 0, out: 1 });
    expect(resolveEventDelta({ mediaName: "check-in", count: [1, 0], direction: 1 }, camMap)).toEqual({ in: 1, out: 0 });
  });

  it("mapped camera + directionless tripwire = 1 crossing", () => {
    expect(resolveEventDelta({ mediaName: "check-out" }, camMap)).toEqual({ in: 0, out: 1 });
  });

  it("mapped camera sums multi-person Count as its direction", () => {
    expect(resolveEventDelta({ mediaName: "check-in", count: [3, 0] }, camMap)).toEqual({ in: 3, out: 0 });
  });

  it("unmapped camera trusts event Count then Direction", () => {
    expect(resolveEventDelta({ mediaName: "gate-x", count: [0, 2] }, camMap)).toEqual({ in: 0, out: 2 });
    expect(resolveEventDelta({ mediaName: "gate-x", direction: 2 }, camMap)).toEqual({ in: 0, out: 1 });
    expect(resolveEventDelta({ mediaName: "gate-x" }, camMap)).toEqual({ in: 0, out: 0 });
  });

  it("empty map = pure event-direction mode (single bidirectional camera)", () => {
    expect(resolveEventDelta({ mediaName: "check-in", count: [0, 1] }, {})).toEqual({ in: 0, out: 1 });
  });
});

// timeText is the box-local string; bucketing keys off its date/hour.
const ev = (timeText: string, inc: number, out: number): FootfallEvent => ({
  timeText,
  in: inc,
  out
});

const events: FootfallEvent[] = [
  ev("2026-07-01 08:15:00", 1, 0),
  ev("2026-07-01 08:40:00", 1, 0),
  ev("2026-07-01 17:05:00", 0, 1),
  ev("2026-07-02 09:00:00", 3, 0), // multi-person event (Count[0]=3)
  ev("2026-07-15 10:00:00", 2, 2),
  ev("2026-08-03 07:00:00", 4, 1)
];

describe("aggregateFootfall", () => {
  it("day: zero-fills range, sums in/out deltas", () => {
    const r = aggregateFootfall(events, "day", "2026-07-01", "2026-07-03");
    expect(r.series.map((b) => b.in)).toEqual([2, 3, 0]);
    expect(r.series.map((b) => b.out)).toEqual([1, 0, 0]);
    expect(r.series.map((b) => b.label)).toEqual(["01/07", "02/07", "03/07"]);
    expect(r.totalIn).toBe(5);
    expect(r.totalOut).toBe(1);
    expect(r.series.map((b) => b.visits)).toEqual([1, 0, 0]); // 07-01 pairs 1, 07-02 has no Out
    expect(r.totalVisits).toBe(1);
    expect(r.peak?.period).toBe("2026-07-01"); // only bucket with a completed visit
  });

  it("month: groups by YYYY-MM", () => {
    const r = aggregateFootfall(events, "month", "2026-07-01", "2026-08-31");
    expect(r.series.map((b) => b.period)).toEqual(["2026-07", "2026-08"]);
    expect(r.series.map((b) => b.in)).toEqual([7, 4]); // Jul (1+1)+3+2, Aug 4
    expect(r.series.map((b) => b.out)).toEqual([3, 1]); // Jul 1+2, Aug 1
    expect(r.totalIn).toBe(11);
    expect(r.totalOut).toBe(4);
    expect(r.series.map((b) => b.visits)).toEqual([3, 1]); // Jul 1+0+2, Aug 1
    expect(r.totalVisits).toBe(4);
  });

  it("ignores events outside the range", () => {
    const r = aggregateFootfall(events, "day", "2026-07-01", "2026-07-01");
    expect(r.totalIn).toBe(2);
    expect(r.totalOut).toBe(1);
    expect(r.series).toHaveLength(1);
  });

  it("reversed range yields empty series", () => {
    const r = aggregateFootfall(events, "day", "2026-07-10", "2026-07-01");
    expect(r.series).toEqual([]);
    expect(r.totalIn).toBe(0);
    expect(r.peak).toBeNull();
  });

  it("hourly: 24 buckets for the requested day only", () => {
    const r = aggregateFootfall(events, "day", "2026-07-01", "2026-07-02", "2026-07-01");
    expect(r.hourly).not.toBeNull();
    expect(r.hourly).toHaveLength(24);
    expect(r.hourly![8]).toEqual({ hour: "08", in: 2, out: 0 });
    expect(r.hourly![17]).toEqual({ hour: "17", in: 0, out: 1 });
    expect(r.hourly![9]).toEqual({ hour: "09", in: 0, out: 0 }); // 07-02 event excluded
  });

  it("no day → hourly is null", () => {
    const r = aggregateFootfall(events, "day", "2026-07-01", "2026-07-01");
    expect(r.hourly).toBeNull();
  });
});

// A "lượt khách" = one In paired with one Out, via the same countVisitPairs the
// forwarder uses. These lock the two decisions that pairing depends on: WHICH
// camera and WHICH day.
const evc = (timeText: string, camera: string | null, inc: number, out: number): FootfallEvent => ({
  timeText,
  camera,
  in: inc,
  out
});

describe("aggregateFootfall visits", () => {
  it("pairs within each camera, not across cameras", () => {
    // Totals are in=6/out=6, so collapsing the cameras first would claim 6 visits.
    // Each gate only completed one round trip, so the honest answer is 2.
    const r = aggregateFootfall(
      [
        evc("2026-07-01 08:00:00", "cong-truoc", 5, 0),
        evc("2026-07-01 09:00:00", "cong-truoc", 0, 1),
        evc("2026-07-01 08:00:00", "cong-sau", 1, 0),
        evc("2026-07-01 09:00:00", "cong-sau", 0, 5)
      ],
      "day",
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.totalIn).toBe(6);
    expect(r.totalOut).toBe(6);
    expect(r.totalVisits).toBe(2);
  });

  it("pairs per day, so a coarser bucket sums days instead of re-pairing", () => {
    // Wed In and Thu Out share one ISO week. min(weekIn, weekOut) would say 1
    // visit; neither day completed a pair, so the week is 0.
    const r = aggregateFootfall(
      [evc("2026-07-01 08:00:00", "cong-truoc", 1, 0), evc("2026-07-02 18:00:00", "cong-truoc", 0, 1)],
      "week",
      "2026-06-29",
      "2026-07-05"
    );
    expect(r.series).toHaveLength(1);
    expect(r.series[0]).toMatchObject({ period: "2026-06-29", in: 1, out: 1, visits: 0 });
    expect(r.totalVisits).toBe(0);
  });

  it("leftovers are dropped: In without a matching Out is not a visit", () => {
    const r = aggregateFootfall(
      [evc("2026-07-01 08:00:00", "cong-truoc", 10, 3)],
      "day",
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.totalVisits).toBe(3);
  });

  it("events with no camera name share one tally", () => {
    const r = aggregateFootfall(
      [evc("2026-07-01 08:00:00", null, 2, 0), evc("2026-07-01 18:00:00", undefined as unknown as null, 0, 2)],
      "day",
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.totalVisits).toBe(2);
  });

  it("hourly stays in/out — hours are not paired", () => {
    // Enter 10h, leave 12h: one visit for the day, zero pairs in either hour.
    const r = aggregateFootfall(
      [evc("2026-07-01 10:00:00", "cong-truoc", 1, 0), evc("2026-07-01 12:00:00", "cong-truoc", 0, 1)],
      "day",
      "2026-07-01",
      "2026-07-01",
      "2026-07-01"
    );
    expect(r.totalVisits).toBe(1);
    expect(r.hourly![10]).toEqual({ hour: "10", in: 1, out: 0 });
    expect(r.hourly![12]).toEqual({ hour: "12", in: 0, out: 1 });
  });
});
