import { connectMongo } from "@/lib/mongodb";
import { AlarmModel, type AlarmDocument } from "@/models/alarm";
import { NON_ALARM_SUMMARIES } from "@/lib/aibox/event-types";
import { deleteAlarmsByIds, parseDeleteIds } from "@/services/alarm-deletion";
import { serializeAlarmListItem } from "@/services/alarm-serializer";
import type { QueryFilter } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parsePositiveInt(searchParams.get("page"), 1, 100000);
  const limit = parsePositiveInt(searchParams.get("limit"), 20, 100);
  const queryText = searchParams.get("q")?.trim();

  const filter: QueryFilter<AlarmDocument> = {};

  for (const key of ["taskSession", "summary", "description", "mediaName"] as const) {
    const value = searchParams.get(key)?.trim();
    if (value) filter[key] = value;
  }

  // Counting events (People Counting / Line Crossing) and the FaceIdCount
  // statistics heartbeat are traffic data, not alarms — hide them unless the
  // caller asks for that summary explicitly.
  if (!filter.summary) {
    filter.summary = { $nin: [...NON_ALARM_SUMMARIES] };
  }

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from || to) {
    filter.time = {};
    if (from) filter.time.$gte = new Date(from);
    if (to) filter.time.$lte = new Date(to);
  }

  if (queryText) {
    const regex = new RegExp(escapeRegex(queryText), "i");
    filter.$or = [
      { alarmId: regex },
      { uniqueId: regex },
      { taskSession: regex },
      { taskDesc: regex },
      { summary: regex },
      { description: regex },
      { mediaName: regex }
    ];
  }

  await connectMongo();

  const [items, total, allTotal] = await Promise.all([
    AlarmModel.find(filter)
      .sort({ time: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<AlarmDocument[]>(),
    AlarmModel.countDocuments(filter),
    // "Tổng cảnh báo" must exclude the same non-alarm traffic the list hides —
    // otherwise the ~60s FaceIdCount heartbeat (~2.880/day) swamps the number.
    AlarmModel.countDocuments({ summary: { $nin: [...NON_ALARM_SUMMARIES] } })
  ]);

  return NextResponse.json({
    data: items.map((item) => serializeAlarmListItem(item as AlarmDocument & { _id: unknown })),
    page,
    limit,
    total,
    allTotal,
    totalPages: Math.ceil(total / limit)
  });
}

export async function DELETE(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = parseDeleteIds(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const deleted = await deleteAlarmsByIds(parsed.ids);

  return NextResponse.json({ ok: true, deleted });
}
