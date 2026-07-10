import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import { computeStats, type StatInput } from "@/lib/aibox/alarm-stats";
import { NextRequest, NextResponse } from "next/server";

// Cap the working set so aggregation stays cheap; alarm volumes are modest and
// the `time` index backs the sort. `days` controls the per-day chart window.
const MAX_DOCS = 5000;
const DEFAULT_DAYS = 30;

function vietnamTodayKey(): string {
  // en-CA formats as YYYY-MM-DD; pin to Vietnam time to match the display rule.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(searchParams.get("days")) || DEFAULT_DAYS));

  await connectMongo();

  const docs = (await AlarmModel.find({}, { time: 1, timeText: 1, mediaName: 1, summary: 1 })
    .sort({ time: -1 })
    .limit(MAX_DOCS)
    .lean()) as StatInput[];

  const stats = computeStats(docs, vietnamTodayKey(), days);
  return NextResponse.json(stats);
}
