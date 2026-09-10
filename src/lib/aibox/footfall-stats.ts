// Pure aggregation of People Counting (HeadCount) crossings into in/out counts
// per day/week/month bucket, plus an optional 24-hour breakdown for one day.
// DB/DOM-free so it is unit-testable and reused by the /api/footfall route.
//
// Supersedes the face-dedup "unique visitor" count for the Lưu lượng khách page:
// footfall is the directional crossing count reported directly by the box, so it
// needs no embedding/dedup.

import { bucketKey, bucketLabel, eachDay, type Granularity } from "./period-buckets";
import { dateKey, hourOf } from "./alarm-stats";
import { countVisitPairs, type CameraTally } from "./headcount-visits";

export type { Granularity };

/** One counting event reduced to its in/out delta + the box-local time strings. */
export interface FootfallEvent {
  timeText?: string | null; // box-local "YYYY-MM-DD HH:MM:SS" (preferred for bucketing)
  time?: string | Date | null; // fallback
  camera?: string | null; // Media.MediaName — a visit only pairs within one camera
  in: number; // people crossing inward on this event
  out: number; // people crossing outward on this event
}

export type Direction = "in" | "out";
/** Maps a camera (Media.MediaName) to a fixed crossing direction. Used for the
 *  two-one-way-cameras layout where direction is decided by WHICH camera saw the
 *  crossing, not by the event's own Direction field. */
export type CameraDirectionMap = Record<string, Direction>;

/** The raw fields of a counting event needed to resolve its in/out contribution. */
export interface RawCountingEvent {
  mediaName?: string | null;
  count?: unknown; // Result.Count, expected [in, out]
  direction?: unknown; // Result.Direction, 1=in / 2=out
}

/**
 * Resolve one counting event to its in/out delta.
 *
 * - Camera IS in `cameraMap` (two one-way cameras): every crossing counts toward
 *   that camera's fixed direction; magnitude = people in the event (Count sum, or
 *   1 for a directionless tripwire). The event's own Direction is ignored — the
 *   box labels In/Out per line-arrow and can't know which camera is the exit.
 * - Camera NOT mapped (single bidirectional camera): trust the event's own
 *   Count [in,out], else its Direction (1=in, 2=out).
 */
export function resolveEventDelta(
  ev: RawCountingEvent,
  cameraMap: CameraDirectionMap
): { in: number; out: number } {
  const count = ev.count;
  const hasCount = Array.isArray(count) && count.length >= 2;
  const people = hasCount ? (Number(count[0]) || 0) + (Number(count[1]) || 0) : 1;

  const mapped = ev.mediaName ? cameraMap[ev.mediaName] : undefined;
  if (mapped === "in") return { in: people, out: 0 };
  if (mapped === "out") return { in: 0, out: people };

  if (hasCount) return { in: Number(count[0]) || 0, out: Number(count[1]) || 0 };
  if (ev.direction === 1 || ev.direction === "1") return { in: 1, out: 0 };
  if (ev.direction === 2 || ev.direction === "2") return { in: 0, out: 1 };
  return { in: 0, out: 0 };
}

export interface FootfallBucket {
  period: string; // day=YYYY-MM-DD, week=Monday YYYY-MM-DD, month=YYYY-MM
  label: string; // dd/MM or MM/YYYY
  in: number;
  out: number;
  visits: number; // lượt khách: 1 in + 1 out, paired per camera per day
}

export interface HourBucket {
  hour: string; // "00".."23"
  in: number;
  out: number;
}

export interface FootfallResult {
  granularity: Granularity;
  from: string;
  to: string;
  totalIn: number;
  totalOut: number;
  totalVisits: number; // sum of the buckets' paired visits
  peak: FootfallBucket | null; // busiest bucket, ranked by visits (in+out breaks ties)
  series: FootfallBucket[];
  hourly: HourBucket[] | null; // 24 buckets when a `day` is requested, else null
}

/** Camera bucket for events with no MediaName — mirrors the forwarder's label. */
const UNKNOWN_CAMERA = "(không rõ camera)";

const EMPTY_DAY = { in: 0, out: 0, visits: 0 } as const;

/**
 * Aggregate HeadCount events into contiguous, zero-filled in/out buckets over
 * [from, to], plus the paired `visits` count. When `day` is given, also returns
 * a 24-hour in/out breakdown for that box-local day (for the peak-hour view).
 */
export function aggregateFootfall(
  events: FootfallEvent[],
  granularity: Granularity,
  from: string,
  to: string,
  day?: string
): FootfallResult {
  // Sum in/out per box-local date, KEEPING the camera dimension. A visit is one
  // In paired with one Out on the SAME camera, so the cameras of a day may only
  // be collapsed together after the pairing has happened.
  const byDate = new Map<string, Map<string, CameraTally>>();
  for (const e of events) {
    const key = dateKey(e.timeText, e.time);
    if (!key) continue;
    const camera = e.camera?.trim() || UNKNOWN_CAMERA;
    let cameras = byDate.get(key);
    if (!cameras) {
      cameras = new Map();
      byDate.set(key, cameras);
    }
    const cur = cameras.get(camera) ?? { camera, in: 0, out: 0 };
    cur.in += e.in || 0;
    cur.out += e.out || 0;
    cameras.set(camera, cur);
  }

  // Collapse each day to in/out/visits. Pairing happens HERE, at day level, and
  // never again: a week or month bucket is the SUM of its days' visits, not
  // min(bucketIn, bucketOut). Pairing at week level would let a Sunday In pair
  // with a Monday Out — a bigger number that no longer matches the daily figure
  // the forwarder sends out.
  const dayTotals = new Map<string, { in: number; out: number; visits: number }>();
  for (const [date, cameras] of byDate) {
    const tallies = [...cameras.values()];
    dayTotals.set(date, {
      in: tallies.reduce((sum, t) => sum + t.in, 0),
      out: tallies.reduce((sum, t) => sum + t.out, 0),
      visits: countVisitPairs(tallies)
    });
  }

  // Fold days into day/week/month buckets across the requested range.
  const buckets = new Map<string, FootfallBucket>();
  for (const d of eachDay(from, to)) {
    const key = bucketKey(d, granularity);
    const add = dayTotals.get(d) ?? EMPTY_DAY;
    const existing = buckets.get(key);
    if (existing) {
      existing.in += add.in;
      existing.out += add.out;
      existing.visits += add.visits;
    } else {
      buckets.set(key, {
        period: key,
        label: bucketLabel(key, granularity),
        in: add.in,
        out: add.out,
        visits: add.visits
      });
    }
  }

  const series = [...buckets.values()];
  const totalIn = series.reduce((s, b) => s + b.in, 0);
  const totalOut = series.reduce((s, b) => s + b.out, 0);
  const totalVisits = series.reduce((s, b) => s + b.visits, 0);
  // Ranked by visits since that is the headline number; in+out breaks ties so a
  // range with traffic but no completed pair still points at its busiest bucket.
  const peak = series.reduce<FootfallBucket | null>(
    (best, b) =>
      !best || b.visits > best.visits || (b.visits === best.visits && b.in + b.out > best.in + best.out)
        ? b
        : best,
    null
  );

  // Optional 24-hour breakdown for a single box-local day. Deliberately in/out
  // and NOT visits: someone entering at 10h and leaving at 12h is one visit for
  // the day but pairs to zero in both hours, so hourly visits would not add up
  // to the day's figure. For "giờ cao điểm" the arrivals per hour is the useful
  // number anyway.
  let hourly: HourBucket[] | null = null;
  if (day) {
    const hours: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({
      hour: String(h).padStart(2, "0"),
      in: 0,
      out: 0
    }));
    for (const e of events) {
      if (dateKey(e.timeText, e.time) !== day) continue;
      const h = hourOf(e.timeText, e.time);
      if (h !== null && h >= 0 && h < 24) {
        hours[h].in += e.in || 0;
        hours[h].out += e.out || 0;
      }
    }
    hourly = hours;
  }

  return { granularity, from, to, totalIn, totalOut, totalVisits, peak, series, hourly };
}
