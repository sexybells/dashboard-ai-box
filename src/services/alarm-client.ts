export interface AlarmListItem {
  id: string;
  dedupeKey?: string;
  alarmId?: string;
  uniqueId?: string;
  taskSession?: string;
  taskDesc?: string;
  summary?: string;
  description?: string;
  time?: string;
  timeText?: string;
  timestamp?: number;
  boardId?: string;
  boardIp?: string;
  mediaName?: string;
  mediaUrl?: string;
  imageKind: "base64" | "aibox-path" | "none";
  imageUrl?: string | null;
  imageOriginal?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AlarmListResponse {
  data: AlarmListItem[];
  total: number;
  allTotal: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AlarmFilters {
  q: string;
  taskSession: string;
  summary: string;
  mediaName: string;
}

export const ALARM_PAGE_SIZE = 30;

export function buildAlarmListQuery(filters: AlarmFilters, page = 1, limit = ALARM_PAGE_SIZE): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });

  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
  }

  return params.toString();
}

export async function fetchAlarmList(filters: AlarmFilters, page = 1): Promise<AlarmListResponse> {
  const response = await fetch(`/api/alarms?${buildAlarmListQuery(filters, page)}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load alarms: ${response.status}`);
  }

  return (await response.json()) as AlarmListResponse;
}

/** Permanently deletes the given alarms and returns how many were removed. */
export async function deleteAlarms(ids: readonly string[]): Promise<number> {
  const response = await fetch("/api/alarms", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids })
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; deleted?: number; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || `Xoá cảnh báo thất bại (${response.status})`);
  }

  return payload?.deleted ?? 0;
}
