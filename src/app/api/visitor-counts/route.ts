import { connectMongo } from "@/lib/mongodb";
import { VisitorDailyCountModel } from "@/models/visitor-daily-count";
import { aggregateVisitorCounts, isDateKey, parseGranularity } from "@/lib/aibox/visitor-stats";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_WINDOW_DAYS = 29; // last 30 days inclusive

// en-CA formats as YYYY-MM-DD; pin to Vietnam time to match the worker's day key.
function vietnamTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function shiftDay(key: string, deltaDays: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const granularity = parseGranularity(searchParams.get("granularity"));

  const today = vietnamTodayKey();
  const toParam = searchParams.get("to");
  const fromParam = searchParams.get("from");
  const to = isDateKey(toParam) ? toParam : today;
  const from = isDateKey(fromParam) ? fromParam : shiftDay(to, -DEFAULT_WINDOW_DAYS);
  // Normalize order so a reversed range still returns a sensible window.
  const [lo, hi] = from <= to ? [from, to] : [to, from];

  await connectMongo();
  const docs = await VisitorDailyCountModel.find(
    { _id: { $gte: lo, $lte: hi } },
    { unique_count: 1 }
  ).lean();
  const rows = docs.map((d) => ({ date: String(d._id), count: d.unique_count ?? 0 }));

  const result = aggregateVisitorCounts(rows, granularity, lo, hi);
  return NextResponse.json({ ok: true, ...result });
}
