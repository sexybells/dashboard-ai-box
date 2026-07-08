export type AlarmImageKind = "base64" | "aibox-path" | "none";

export interface NormalizedAlarmInput {
  dedupeKey: string;
  alarmId?: string;
  uniqueId?: string;
  taskSession?: string;
  taskDesc?: string;
  summary?: string;
  description?: string;
  time?: Date;
  timeText?: string;
  timestamp?: number;
  boardId?: string;
  boardIp?: string;
  mediaName?: string;
  mediaUrl?: string;
  imageKind: AlarmImageKind;
  imageOriginal?: string;
  raw: Record<string, unknown>;
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseAiBoxTime(value: unknown): Date | undefined {
  const text = asString(value);
  if (!text) return undefined;

  const normalized = text.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function getAiBoxImageKind(imageData: unknown): AlarmImageKind {
  const value = asString(imageData);
  if (!value) return "none";
  if (value.startsWith("/9j/") || value.startsWith("iVBOR") || value.startsWith("R0lGOD")) {
    return "base64";
  }
  if (value.includes("/") || value.endsWith(".jpg") || value.endsWith(".jpeg") || value.endsWith(".png")) {
    return "aibox-path";
  }
  return "none";
}

export function normalizeAiBoxAlarm(
  payload: Record<string, unknown>,
  payloadHash: string
): NormalizedAlarmInput {
  const media = asRecord(payload.Media);
  const result = asRecord(payload.Result);
  const uniqueId = asString(payload.UniqueId);
  const alarmId = asString(payload.AlarmId);
  const imageOriginal = asString(payload.ImageData) ?? asString(payload.LocalRawPath);
  const dedupeKey = uniqueId
    ? `unique:${uniqueId}`
    : alarmId
      ? `alarm:${alarmId}`
      : `hash:${payloadHash}`;

  return {
    dedupeKey,
    alarmId,
    uniqueId,
    taskSession: asString(payload.TaskSession),
    taskDesc: asString(payload.TaskDesc),
    summary: asString(payload.Summary),
    description: asString(result.Description),
    time: parseAiBoxTime(payload.Time),
    timeText: asString(payload.Time),
    timestamp: asNumber(payload.TimeStamp),
    boardId: asString(payload.BoardId),
    boardIp: asString(payload.BoardIp),
    mediaName: asString(media.MediaName),
    mediaUrl: asString(media.MediaUrl),
    imageKind: getAiBoxImageKind(imageOriginal),
    imageOriginal,
    raw: payload
  };
}
