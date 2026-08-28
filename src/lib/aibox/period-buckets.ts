// Shared day/week/month bucketing over a "YYYY-MM-DD" date range. DB/DOM-free so
// it is unit-testable and reused by any period-series aggregation. Dates are
// plain day keys (already Asia/Ho_Chi_Minh day) handled in UTC to avoid drift.

export type Granularity = "day" | "week" | "month";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DAYS = 2000; // ~5.5y guard against runaway ranges

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export function parseGranularity(value: unknown): Granularity {
  return value === "week" || value === "month" ? value : "day";
}

/** Every "YYYY-MM-DD" from `from` to `to` inclusive (empty if from>to or invalid). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard++ < MAX_DAYS) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Monday (YYYY-MM-DD) of the ISO week containing `day`. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/** Bucket key for a day: month=YYYY-MM, week=Monday date, day=the date itself. */
export function bucketKey(day: string, g: Granularity): string {
  if (g === "month") return day.slice(0, 7);
  if (g === "week") return mondayOf(day);
  return day;
}

/** Short axis label for a bucket key: month=MM/YYYY, day/week=dd/MM. */
export function bucketLabel(key: string, g: Granularity): string {
  if (g === "month") {
    const [y, m] = key.split("-");
    return `${m}/${y}`;
  }
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}
