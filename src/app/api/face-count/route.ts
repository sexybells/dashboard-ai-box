import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import {
  summarizePeriods,
  type DayCameraTotal,
  type FaceIdWindow
} from "@/lib/aibox/face-id-count";
import { FACEIDCOUNT_SUMMARY } from "@/lib/aibox/event-types";
import { isDateKey } from "@/lib/aibox/period-buckets";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function vietnamTodayKey(): string {
  // en-CA formats as YYYY-MM-DD; pin to Vietnam time to match the display rule.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

/**
 * Reduce every FaceIdCount heartbeat to one row per (day, camera) inside Mongo.
 *
 * Done as an aggregation rather than in Node because the box heartbeats every
 * ~60s per camera — with seven cameras that is ~10.000 documents a day, and the
 * running total has to look at every day on record. The output is tiny: days ×
 * cameras.
 *
 * The `$max` on Count is the important step: each heartbeat resends the same
 * CUMULATIVE window figure, so the day's value is the highest one seen, never
 * the sum of the beats. Windows within a day are disjoint hour ranges and ARE
 * summed.
 *
 * Days come from `timestamp` (µs, UTC) — it matches the server clock exactly,
 * while the box's own `Time` string currently runs an hour fast and would file
 * events near midnight under the wrong day. `time` is the fallback for any
 * document written without a timestamp.
 */
const DAY_CAMERA_TOTALS = [
  { $match: { summary: FACEIDCOUNT_SUMMARY } },
  {
    $project: {
      camera: { $ifNull: ["$mediaName", "(không rõ camera)"] },
      day: {
        $dateToString: {
          format: "%Y-%m-%d",
          timezone: "Asia/Ho_Chi_Minh",
          date: {
            $cond: [
              { $gt: [{ $ifNull: ["$timestamp", 0] }, 0] },
              { $toDate: { $divide: ["$timestamp", 1000] } },
              "$time"
            ]
          }
        }
      },
      windows: {
        $let: {
          vars: {
            entry: {
              $filter: {
                input: { $ifNull: ["$raw.Result.Properties", []] },
                as: "property",
                cond: { $eq: ["$$property.property", "FaceIdCount"] }
              }
            }
          },
          in: { $ifNull: [{ $arrayElemAt: ["$$entry.value", 0] }, []] }
        }
      }
    }
  },
  { $unwind: "$windows" },
  {
    $group: {
      _id: {
        day: "$day",
        camera: "$camera",
        window: {
          $concat: [{ $toString: "$windows.Start" }, "-", { $toString: "$windows.End" }]
        }
      },
      count: { $max: { $ifNull: ["$windows.Count", 0] } }
    }
  },
  {
    $group: {
      _id: { day: "$_id.day", camera: "$_id.camera" },
      total: { $sum: "$count" }
    }
  },
  { $project: { _id: 0, day: "$_id.day", camera: "$_id.camera", total: 1 } }
];

export async function GET(request: NextRequest) {
  const dayParam = request.nextUrl.searchParams.get("day");
  const day = isDateKey(dayParam) ? dayParam : vietnamTodayKey();

  await connectMongo();

  const [rows, latest] = await Promise.all([
    AlarmModel.aggregate<DayCameraTotal>(DAY_CAMERA_TOTALS),
    AlarmModel.findOne({ summary: FACEIDCOUNT_SUMMARY }, { timestamp: 1, raw: 1, mediaName: 1 })
      .sort({ time: -1 })
      .lean()
  ]);

  // FACE_COUNT_CAMERA pins which camera is the source of truth for every day.
  // Unset = the highest-counting camera that day, which can never double count.
  const preferred = process.env.FACE_COUNT_CAMERA;
  const { periods, byDay, todayCamera } = summarizePeriods(rows, day, preferred);

  // Today's per-camera split, so it is obvious which camera to pin.
  const camerasToday = rows
    .filter((row) => row.day === day)
    .sort((a, b) => b.total - a.total)
    .map(({ camera, total }) => ({ camera, total }));

  const windows: FaceIdWindow[] =
    (latest?.raw as { Result?: { Properties?: { property?: string; value?: unknown }[] } })?.Result
      ?.Properties?.find((property) => property.property === "FaceIdCount")
      ?.value as FaceIdWindow[] ?? [];

  return NextResponse.json({
    ok: true,
    day,
    camera: todayCamera,
    periods,
    byDay,
    camerasToday,
    /** Hour windows as currently configured on the box, from the newest event. */
    configuredWindows: Array.isArray(windows) ? windows : [],
    updatedAt:
      typeof latest?.timestamp === "number"
        ? new Date(latest.timestamp / 1000).toISOString()
        : null
  });
}
