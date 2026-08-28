import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import {
  extractFaceIdWindows,
  pickCameraTotal,
  totalFromSnapshots,
  type CameraFaceCount,
  type FaceIdWindow
} from "@/lib/aibox/face-id-count";
import { FACEIDCOUNT_SUMMARY } from "@/lib/aibox/event-types";
import { isDateKey } from "@/lib/aibox/period-buckets";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// The box heartbeats every ~60s per camera, so a day holds ~1.500 documents per
// camera. Cap the working set well above that; the `time` index backs the sort.
const MAX_DOCS = 5000;

function vietnamTodayKey(): string {
  // en-CA formats as YYYY-MM-DD; pin to Vietnam time to match the display rule.
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

/**
 * Box-independent day key for an event.
 *
 * `TimeStamp` (µs since the UTC epoch) is the trustworthy clock: it matches the
 * server's receive time to the second. The box's `Time` string is currently an
 * hour fast (its timezone is set to UTC+8, not UTC+7), so bucketing by that
 * string would misfile every event near midnight into the wrong day.
 */
function vietnamDayOf(timestampMicros?: number, time?: Date | null): string | null {
  const ms =
    typeof timestampMicros === "number" && Number.isFinite(timestampMicros)
      ? timestampMicros / 1000
      : time
        ? time.getTime()
        : NaN;
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(ms));
}

export async function GET(request: NextRequest) {
  const dayParam = request.nextUrl.searchParams.get("day");
  const day = isDateKey(dayParam) ? dayParam : vietnamTodayKey();

  await connectMongo();

  // Prefilter on the indexed `time` field, widened ±1 day: `time` is parsed from
  // the box's local string, which is both an hour fast and read in the server's
  // timezone, so it can sit several hours away from the true instant. The exact
  // day is decided below from `timestamp`.
  const docs = await AlarmModel.find(
    {
      summary: FACEIDCOUNT_SUMMARY,
      time: {
        $gte: new Date(`${shiftDay(day, -1)}T00:00:00.000Z`),
        $lte: new Date(`${shiftDay(day, 1)}T23:59:59.999Z`)
      }
    },
    { mediaName: 1, timestamp: 1, time: 1, raw: 1 }
  )
    .sort({ time: -1 })
    .limit(MAX_DOCS)
    .lean();

  // Group the day's snapshots per camera; cameras are counted separately because
  // their face-id counters overlap and must not be added together.
  const snapshotsByCamera = new Map<string, FaceIdWindow[][]>();
  let updatedAt: string | null = null;

  for (const doc of docs) {
    if (vietnamDayOf(doc.timestamp, doc.time) !== day) continue;
    const windows = extractFaceIdWindows(doc.raw);
    if (windows.length === 0) continue;

    const camera = doc.mediaName ?? "(không rõ camera)";
    const list = snapshotsByCamera.get(camera);
    if (list) list.push(windows);
    else snapshotsByCamera.set(camera, [windows]);

    // Docs arrive newest-first, so the first one we keep is the freshest.
    if (!updatedAt && typeof doc.timestamp === "number") {
      updatedAt = new Date(doc.timestamp / 1000).toISOString();
    }
  }

  const cameras: CameraFaceCount[] = [...snapshotsByCamera.entries()]
    .map(([camera, snapshots]) => ({ camera, ...totalFromSnapshots(snapshots) }))
    .sort((a, b) => b.total - a.total);

  // FACE_COUNT_CAMERA pins which camera is the source of truth. Unset = highest
  // total, which can never double count.
  const picked = pickCameraTotal(cameras, process.env.FACE_COUNT_CAMERA);

  return NextResponse.json({
    ok: true,
    day,
    total: picked?.total ?? 0,
    camera: picked?.camera ?? null,
    windows: picked?.windows ?? [],
    cameras,
    updatedAt
  });
}
