import type { AlarmFilters, AlarmListItem, AlarmListResponse } from "./alarm-client";

export interface RealtimeAlarmMergeResult {
  data: AlarmListResponse;
  inserted: boolean;
  highlightedId: string | null;
}

function includesText(value: string | undefined, query: string): boolean {
  return Boolean(value && value.toLowerCase().includes(query));
}

export function alarmMatchesFilters(alarm: AlarmListItem, filters: AlarmFilters): boolean {
  const taskSession = filters.taskSession.trim();
  if (taskSession && alarm.taskSession !== taskSession) return false;

  const summary = filters.summary.trim();
  if (summary && alarm.summary !== summary) return false;

  const mediaName = filters.mediaName.trim();
  if (mediaName && alarm.mediaName !== mediaName) return false;

  const query = filters.q.trim().toLowerCase();
  if (!query) return true;

  return [
    alarm.alarmId,
    alarm.uniqueId,
    alarm.taskSession,
    alarm.taskDesc,
    alarm.summary,
    alarm.description,
    alarm.mediaName
  ].some((value) => includesText(value, query));
}

export function mergeRealtimeAlarm(
  current: AlarmListResponse,
  alarm: AlarmListItem,
  filters: AlarmFilters,
  limit = current.limit
): RealtimeAlarmMergeResult {
  const existingIndex = current.data.findIndex((item) => item.id === alarm.id);

  if (existingIndex >= 0) {
    const nextItems = [...current.data];
    nextItems.splice(existingIndex, 1);

    return {
      data: {
        ...current,
        data: [alarm, ...nextItems].slice(0, limit)
      },
      inserted: false,
      highlightedId: alarm.id
    };
  }

  const matches = alarmMatchesFilters(alarm, filters);
  const total = matches ? current.total + 1 : current.total;
  const allTotal = current.allTotal + 1;

  return {
    data: {
      ...current,
      data: matches ? [alarm, ...current.data].slice(0, limit) : current.data,
      total,
      allTotal,
      totalPages: Math.ceil(total / current.limit)
    },
    inserted: matches,
    highlightedId: matches ? alarm.id : null
  };
}
