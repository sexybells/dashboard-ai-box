// Reduces the AI Box "Count By Face Id" (FaceIdCount) heartbeat into one
// unique-visitor number. DB/DOM-free so it is unit-testable, mirroring the
// footfall-stats module.
//
// Shape of the box data (verified against live payloads):
//   Result.Properties[property="FaceIdCount"].value
//     = [{ Start: 6, End: 9, Count: 0 }, { Start: 10, End: 13, Count: 0 }, ...]
//
// Two properties of that data drive everything here:
//
// 1. Each entry is a CUMULATIVE count for a configured hour window, resent every
//    ~60s per camera. Summing across events would multiply the real number by
//    the number of heartbeats, so snapshots are folded with a per-window MAX.
//    Max (rather than "last") also survives the box resetting a window once it
//    closes, which we cannot yet rule out — no non-zero data exists to check.
//
// 2. Each camera keeps its OWN counter. A visitor walking in past the entrance
//    camera and out past the outer camera is counted once by EACH, so camera
//    totals must never be added together — see pickCameraTotal.

import { mondayOf } from "./period-buckets";

export interface FaceIdWindow {
  start: number; // window start hour as configured on the box
  end: number; // window end hour
  count: number; // unique faces the camera saw inside the window
}

/** The minimum a camera row needs to be picked between. */
export interface CameraTotal {
  camera: string;
  total: number;
}

/** One camera's unique-visitor total for a day, with the windows behind it. */
export interface CameraFaceCount extends CameraTotal {
  windows: FaceIdWindow[];
}

/** One camera's total on one box-local day, as reduced by the Mongo pipeline. */
export interface DayCameraTotal extends CameraTotal {
  day: string; // YYYY-MM-DD, Asia/Ho_Chi_Minh
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Pull the FaceIdCount windows out of a raw AI Box payload. Returns [] for
 * anything that is not a usable FaceIdCount event, so callers can pass mixed
 * payloads without guarding.
 */
export function extractFaceIdWindows(raw: unknown): FaceIdWindow[] {
  const properties = asRecord(asRecord(raw).Result).Properties;
  if (!Array.isArray(properties)) return [];

  const entry = properties.find((item) => asRecord(item).property === "FaceIdCount");
  const value = asRecord(entry).value;
  if (!Array.isArray(value)) return [];

  const windows: FaceIdWindow[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const start = asFiniteNumber(record.Start);
    const end = asFiniteNumber(record.End);
    const count = asFiniteNumber(record.Count);
    // A window without hours is unusable: it cannot be keyed or deduplicated.
    if (start === null || end === null) continue;
    windows.push({ start, end, count: count === null ? 0 : Math.max(0, count) });
  }
  return windows;
}

/**
 * Fold one camera's snapshots for a day into a single total: take the highest
 * count seen per window, then add the windows up. Windows are disjoint hour
 * ranges, so their sum is the day's unique-visitor count at the box's own
 * granularity (a visitor returning in a later window counts again — the box
 * gives us no way to see across windows).
 */
export function totalFromSnapshots(snapshots: FaceIdWindow[][]): {
  total: number;
  windows: FaceIdWindow[];
} {
  const best = new Map<string, FaceIdWindow>();
  for (const snapshot of snapshots) {
    for (const window of snapshot) {
      const key = `${window.start}-${window.end}`;
      const current = best.get(key);
      if (!current || window.count > current.count) best.set(key, { ...window });
    }
  }
  const windows = [...best.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  return { total: windows.reduce((sum, w) => sum + w.count, 0), windows };
}

/**
 * Choose the single number to display across cameras.
 *
 * Camera totals overlap (the same visitor is seen by more than one camera), so
 * they are never summed. When `preferred` names a camera with data, that camera
 * is the source of truth. Otherwise the highest total wins: it cannot double
 * count, and it keeps working when one camera is offline or blind.
 */
export function pickCameraTotal<T extends CameraTotal>(
  cameras: T[],
  preferred?: string | null
): T | null {
  if (cameras.length === 0) return null;
  if (preferred) {
    const match = cameras.find((c) => c.camera === preferred);
    if (match) return match;
  }
  return cameras.reduce((best, c) => (c.total > best.total ? c : best), cameras[0]);
}

/** Cumulative visitor totals over the usual reporting periods. */
export interface FaceCountPeriods {
  today: number;
  week: number; // ISO week (Monday–Sunday) containing `today`
  month: number;
  year: number;
  all: number; // every day on record — the running total that only grows
}

export interface FaceCountSummary {
  periods: FaceCountPeriods;
  /** The one camera counted per day, after resolving the overlap. */
  byDay: DayCameraTotal[];
  todayCamera: string | null;
}

function shiftDayKey(day: string, deltaDays: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Roll per-day-per-camera totals up into cumulative period figures.
 *
 * Two different rules on purpose:
 * - ACROSS CAMERAS on the same day: pick ONE (pinned, else highest). Cameras see
 *   the same visitor, so adding them multiplies one person by the camera count.
 * - ACROSS DAYS: add. Days are disjoint, so summing them is the running total.
 *
 * Caveat that cannot be settled yet: this assumes the box resets its window
 * counters each day. No non-zero data has ever arrived, so that is unverified —
 * if the box turns out to accumulate across days, day totals would already be
 * cumulative and summing them would over-count.
 */
export function summarizePeriods(
  rows: DayCameraTotal[],
  today: string,
  preferred?: string | null
): FaceCountSummary {
  const byDayCameras = new Map<string, DayCameraTotal[]>();
  for (const row of rows) {
    const list = byDayCameras.get(row.day);
    if (list) list.push(row);
    else byDayCameras.set(row.day, [row]);
  }

  const byDay: DayCameraTotal[] = [];
  for (const [, cameras] of byDayCameras) {
    const picked = pickCameraTotal(cameras, preferred);
    if (picked) byDay.push(picked);
  }
  byDay.sort((a, b) => a.day.localeCompare(b.day));

  const monday = mondayOf(today);
  const sunday = shiftDayKey(monday, 6);
  const sum = (predicate: (day: string) => boolean) =>
    byDay.reduce((acc, d) => (predicate(d.day) ? acc + d.total : acc), 0);

  return {
    periods: {
      today: sum((d) => d === today),
      week: sum((d) => d >= monday && d <= sunday),
      month: sum((d) => d.slice(0, 7) === today.slice(0, 7)),
      year: sum((d) => d.slice(0, 4) === today.slice(0, 4)),
      all: sum(() => true)
    },
    byDay,
    todayCamera: byDay.find((d) => d.day === today)?.camera ?? null
  };
}
