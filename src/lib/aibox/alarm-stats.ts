// Pure alarm aggregation helpers. Kept DOM/DB-free so they are unit-testable and
// reused by the Overview page and the Analytics API. Timezone rule mirrors the
// display rule: the original AI Box `timeText` (already local Vietnam time) is
// preferred over the parsed `time` to avoid the +7h drift.

export interface StatInput {
  time?: string | Date | null;
  timeText?: string | null;
  mediaName?: string | null;
  summary?: string | null;
}

export interface CountBucket {
  name: string;
  count: number;
}

export interface DayBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AlarmStats {
  total: number;
  today: number;
  byCamera: CountBucket[];
  byType: CountBucket[];
  perDay: DayBucket[];
  byHour: number[]; // length 24
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
const TIME_RE = /^\d{4}-\d{2}-\d{2}[ T](\d{2}):/;

/** Extract a YYYY-MM-DD key, preferring the original AI Box time text. */
export function dateKey(timeText?: string | null, time?: string | Date | null): string | null {
  const text = timeText?.trim();
  if (text) {
    const match = DATE_RE.exec(text);
    if (match) return match[1];
  }
  if (time instanceof Date && !Number.isNaN(time.getTime())) {
    return time.toISOString().slice(0, 10);
  }
  if (typeof time === "string" && time) {
    const match = DATE_RE.exec(time);
    if (match) return match[1];
  }
  return null;
}

/** Extract the hour-of-day (0-23), preferring the original AI Box time text. */
export function hourOf(timeText?: string | null, time?: string | Date | null): number | null {
  const text = timeText?.trim();
  if (text) {
    const match = TIME_RE.exec(text);
    if (match) return Number(match[1]);
  }
  if (time instanceof Date && !Number.isNaN(time.getTime())) return time.getUTCHours();
  if (typeof time === "string" && time) {
    const match = TIME_RE.exec(time);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Count non-empty values of a field, sorted desc, top N. */
export function countBy(items: StatInput[], field: "mediaName" | "summary", topN = 8): CountBucket[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = item[field]?.trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, topN);
}

/** Zero-filled per-day counts for the last `days` days ending at `todayKey`. */
export function perDay(items: StatInput[], todayKey: string, days = 30): DayBucket[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = dateKey(item.timeText, item.time);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: DayBucket[] = [];
  const end = new Date(`${todayKey}T00:00:00Z`);
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - offset);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

/** Count of alarms per hour bucket (length 24). */
export function byHour(items: StatInput[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const item of items) {
    const hour = hourOf(item.timeText, item.time);
    if (hour !== null && hour >= 0 && hour < 24) hours[hour] += 1;
  }
  return hours;
}

export function computeStats(items: StatInput[], todayKey: string, days = 30): AlarmStats {
  const today = items.filter((item) => dateKey(item.timeText, item.time) === todayKey).length;
  return {
    total: items.length,
    today,
    byCamera: countBy(items, "mediaName"),
    byType: countBy(items, "summary"),
    perDay: perDay(items, todayKey, days),
    byHour: byHour(items)
  };
}
