import { connectMongo } from "@/lib/mongodb";
import { AlarmModel, type AlarmDocument } from "@/models/alarm";
import {
  aggregateFootfall,
  resolveEventDelta,
  type CameraDirectionMap,
  type FootfallEvent
} from "@/lib/aibox/footfall-stats";
import { isDateKey, parseGranularity } from "@/lib/aibox/period-buckets";
import { HEADCOUNT_SUMMARY, PEOPLECROSS_SUMMARY } from "@/lib/aibox/event-types";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_WINDOW_DAYS = 29; // last 30 days inclusive

// en-CA formats as YYYY-MM-DD; pin to Vietnam time to match the box's day key.
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

// Camera→direction map for the two-one-way-cameras layout. Override per site via
// FOOTFALL_CAMERA_DIRECTION (JSON, e.g. {"check-in":"in","check-out":"out"}). Set
// it to "{}" for pure event-direction mode (a single bidirectional camera).
const DEFAULT_CAMERA_DIRECTION: CameraDirectionMap = { "check-in": "in", "check-out": "out" };

function cameraDirectionMap(): CameraDirectionMap {
  const raw = process.env.FOOTFALL_CAMERA_DIRECTION;
  if (raw === undefined) return DEFAULT_CAMERA_DIRECTION;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map: CameraDirectionMap = {};
    for (const [cam, dir] of Object.entries(parsed)) {
      if (dir === "in" || dir === "out") map[cam] = dir;
    }
    return map;
  } catch {
    return DEFAULT_CAMERA_DIRECTION;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const granularity = parseGranularity(searchParams.get("granularity"));

  const today = vietnamTodayKey();
  const toParam = searchParams.get("to");
  const fromParam = searchParams.get("from");
  const to = isDateKey(toParam) ? toParam : today;
  const from = isDateKey(fromParam) ? fromParam : shiftDay(to, -DEFAULT_WINDOW_DAYS);
  const [lo, hi] = from <= to ? [from, to] : [to, from];

  const dayParam = searchParams.get("day");
  const day = isDateKey(dayParam) ? dayParam : undefined;

  await connectMongo();
  const cameraMap = cameraDirectionMap();
  // Prefilter on the indexed `time` field, widened ±1 day to absorb tz skew
  // between the parsed Date and the box-local `timeText`. aggregateFootfall
  // re-buckets by `timeText`, so any extra docs outside [lo,hi] are ignored.
  // Both People Counting (HeadCount) and Line Crossing (PeopleCross) count: a
  // tripwire crossing on a mapped one-way camera is a valid in/out event.
  const docs = await AlarmModel.find(
    {
      summary: { $in: [HEADCOUNT_SUMMARY, PEOPLECROSS_SUMMARY] },
      time: {
        $gte: new Date(`${shiftDay(lo, -1)}T00:00:00.000Z`),
        $lte: new Date(`${shiftDay(hi, 1)}T23:59:59.999Z`)
      }
    },
    { timeText: 1, time: 1, mediaName: 1, "raw.Result.Count": 1, "raw.Result.Direction": 1 }
  ).lean<Pick<AlarmDocument, "timeText" | "time" | "mediaName" | "raw">[]>();

  const events: FootfallEvent[] = docs.map((d) => {
    const result = (d.raw as { Result?: Record<string, unknown> })?.Result ?? {};
    return {
      timeText: d.timeText,
      time: d.time,
      camera: d.mediaName,
      ...resolveEventDelta(
        { mediaName: d.mediaName, count: result.Count, direction: result.Direction },
        cameraMap
      )
    };
  });

  const result = aggregateFootfall(events, granularity, lo, hi, day);
  return NextResponse.json({ ok: true, ...result });
}
