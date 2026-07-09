import type { AlarmDocument } from "@/models/alarm";
import type { AlarmListItem } from "./alarm-client";

export function serializeAlarmListItem(
  alarm: Partial<AlarmDocument> & { _id: unknown }
): AlarmListItem {
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
    imageKind: alarm.imageKind ?? "none",
    imageUrl: alarm.imageUrl,
    imageOriginal: alarm.imageOriginal,
    createdAt: alarm.createdAt?.toISOString(),
    updatedAt: alarm.updatedAt?.toISOString()
  };
}
