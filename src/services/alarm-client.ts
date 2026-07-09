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

export function buildAlarmListQuery(filters: AlarmFilters, limit = 30): string {
  const params = new URLSearchParams({ limit: String(limit) });

  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
  }

  return params.toString();
}

export async function fetchAlarmList(filters: AlarmFilters): Promise<AlarmListResponse> {
  const response = await fetch(`/api/alarms?${buildAlarmListQuery(filters)}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load alarms: ${response.status}`);
  }

  return (await response.json()) as AlarmListResponse;
}
