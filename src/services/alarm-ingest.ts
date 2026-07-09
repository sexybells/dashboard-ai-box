import { hashPayload } from "@/lib/aibox/hash";
import { persistAlarmImage, type ImagePersistenceResult } from "@/lib/aibox/image-storage";
import { normalizeAiBoxAlarm, type NormalizedAlarmInput } from "@/lib/aibox/normalize";
import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
import type { AlarmListItem } from "@/services/alarm-client";
import { serializeAlarmListItem } from "@/services/alarm-serializer";
import { WebhookEventModel } from "@/models/webhook-event";

export interface AlarmIngestRepository {
  createWebhookEvent(event: {
    receivedAt: Date;
    source: string;
    payloadHash: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  findAlarmByDedupeKey(dedupeKey: string): Promise<{ id: string } | null>;
  createAlarm(
    alarm: NormalizedAlarmInput & {
      imageUrl: string | null;
      imagePath: string | null;
    }
  ): Promise<{ id: string; alarm?: AlarmListItem }>;
}

export interface AlarmIngestDependencies {
  repo?: AlarmIngestRepository;
  persistImage?: (
    imageData: unknown,
    dedupeKey: string
  ) => Promise<ImagePersistenceResult>;
}

export interface AlarmIngestResult {
  ok: true;
  duplicate: boolean;
  id: string;
  alarm?: AlarmListItem;
}

class MongoAlarmIngestRepository implements AlarmIngestRepository {
  async createWebhookEvent(event: {
    receivedAt: Date;
    source: string;
    payloadHash: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await connectMongo();
    await WebhookEventModel.create(event);
  }

  async findAlarmByDedupeKey(dedupeKey: string): Promise<{ id: string } | null> {
    await connectMongo();
    const alarm = await AlarmModel.findOne({ dedupeKey }).select("_id").lean();
    return alarm?._id ? { id: String(alarm._id) } : null;
  }

  async createAlarm(
    alarm: NormalizedAlarmInput & {
      imageUrl: string | null;
      imagePath: string | null;
    }
  ): Promise<{ id: string; alarm?: AlarmListItem }> {
    await connectMongo();
    const created = await AlarmModel.create(alarm);
    const serialized = serializeAlarmListItem(
      created.toObject() as NormalizedAlarmInput & {
        _id: unknown;
        imageUrl: string | null;
        imagePath: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    );
    return { id: String(created._id), alarm: serialized };
  }
}

const defaultRepo = new MongoAlarmIngestRepository();

export async function ingestAiBoxWebhook(
  payload: Record<string, unknown>,
  dependencies: AlarmIngestDependencies = {}
): Promise<AlarmIngestResult> {
  const repo = dependencies.repo ?? defaultRepo;
  const imagePersister = dependencies.persistImage ?? persistAlarmImage;
  const payloadHash = hashPayload(payload);
  const normalized = normalizeAiBoxAlarm(payload, payloadHash);

  await repo.createWebhookEvent({
    receivedAt: new Date(),
    source: "aibox",
    payloadHash,
    payload
  });

  const existing = await repo.findAlarmByDedupeKey(normalized.dedupeKey);
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      id: existing.id
    };
  }

  const image = await imagePersister(normalized.imageOriginal, normalized.dedupeKey);
  const alarmInput = {
    ...normalized,
    imageKind: image.kind,
    imageUrl: image.publicUrl,
    imagePath: image.localPath,
    imageOriginal: image.original ?? normalized.imageOriginal
  };
  const created = await repo.createAlarm(alarmInput);
  const alarm =
    created.alarm ??
    ({
      id: created.id,
      dedupeKey: alarmInput.dedupeKey,
      alarmId: alarmInput.alarmId,
      uniqueId: alarmInput.uniqueId,
      taskSession: alarmInput.taskSession,
      taskDesc: alarmInput.taskDesc,
      summary: alarmInput.summary,
      description: alarmInput.description,
      time: alarmInput.time?.toISOString(),
      timeText: alarmInput.timeText,
      timestamp: alarmInput.timestamp,
      boardId: alarmInput.boardId,
      boardIp: alarmInput.boardIp,
      mediaName: alarmInput.mediaName,
      mediaUrl: alarmInput.mediaUrl,
      imageKind: alarmInput.imageKind,
      imageUrl: alarmInput.imageUrl,
      imageOriginal: alarmInput.imageOriginal
    } satisfies AlarmListItem);

  return {
    ok: true,
    duplicate: false,
    id: created.id,
    alarm
  };
}
