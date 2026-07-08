import { connectMongo } from "@/lib/mongodb";
import { AlarmModel, type AlarmDocument } from "@/models/alarm";
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

function serializeAlarm(alarm: AlarmDocument & { _id: unknown }) {
  return {
    id: String(alarm._id),
    dedupeKey: alarm.dedupeKey,
    alarmId: alarm.alarmId,
    uniqueId: alarm.uniqueId,
    taskSession: alarm.taskSession,
    taskDesc: alarm.taskDesc,
    summary: alarm.summary,
    description: alarm.description,
    time: alarm.time?.toISOString(),
    timeText: alarm.timeText,
    timestamp: alarm.timestamp,
    boardId: alarm.boardId,
    boardIp: alarm.boardIp,
    mediaName: alarm.mediaName,
    mediaUrl: alarm.mediaUrl,
    imageKind: alarm.imageKind,
    imageUrl: alarm.imageUrl,
    imageOriginal: alarm.imageOriginal,
    createdAt: alarm.createdAt?.toISOString(),
    updatedAt: alarm.updatedAt?.toISOString()
  };
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
    AlarmModel.estimatedDocumentCount()
  ]);

  return NextResponse.json({
    data: items.map((item) => serializeAlarm(item as AlarmDocument & { _id: unknown })),
    page,
    limit,
    total,
    allTotal,
    totalPages: Math.ceil(total / limit)
  });
}
