// Pure aggregation of daily unique-visitor counts into day/week/month buckets.
// DOM/DB-free so it is unit-testable and reused by the API route. Dates are plain
// "YYYY-MM-DD" keys (already Asia/Ho_Chi_Minh day) — handled in UTC to avoid drift.

export type Granularity = "day" | "week" | "month";

export interface DailyCountRow {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface PeriodBucket {
  period: string; // bucket key: day=YYYY-MM-DD, week=Monday YYYY-MM-DD, month=YYYY-MM
  label: string; // short human label for the axis (dd/MM or MM/YYYY)
  count: number;
}

export interface VisitorCountsResult {
  granularity: Granularity;
  from: string;
  to: string;
  total: number;
  peak: PeriodBucket | null;
  activePeriods: number; // buckets with count > 0
  series: PeriodBucket[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 2000; // ~5.5y guard against runaway ranges

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export function parseGranularity(value: unknown): Granularity {
  return value === "week" || value === "month" ? value : "day";
}

function eachDay(from: string, to: string): string[] {
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
function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

function bucketKey(day: string, g: Granularity): string {
  if (g === "month") return day.slice(0, 7);
  if (g === "week") return mondayOf(day);
  return day;
}

function bucketLabel(key: string, g: Granularity): string {
  if (g === "month") {
    const [y, m] = key.split("-");
    return `${m}/${y}`;
  }
  // day + week keys are full dates → dd/MM
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

/**
 * Aggregate daily counts into contiguous, zero-filled buckets over [from, to].
 *
 * Note: `total` sums daily unique counts, so a visitor returning after the
 * worker's dedup window expires is counted again — the number is an estimate,
 * not an exact distinct-people count over long ranges.
 */
export function aggregateVisitorCounts(
  rows: DailyCountRow[],
  granularity: Granularity,
  from: string,
  to: string
): VisitorCountsResult {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (isDateKey(r.date)) byDate.set(r.date, (byDate.get(r.date) ?? 0) + (r.count || 0));
  }

  const buckets = new Map<string, PeriodBucket>();
  for (const day of eachDay(from, to)) {
    const key = bucketKey(day, granularity);
    const existing = buckets.get(key);
    const add = byDate.get(day) ?? 0;
    if (existing) existing.count += add;
    else buckets.set(key, { period: key, label: bucketLabel(key, granularity), count: add });
  }

  const series = [...buckets.values()];
  const total = series.reduce((sum, b) => sum + b.count, 0);
  const peak = series.reduce<PeriodBucket | null>(
    (best, b) => (!best || b.count > best.count ? b : best),
    null
  );
  const activePeriods = series.filter((b) => b.count > 0).length;

  return { granularity, from, to, total, peak, activePeriods, series };
}
