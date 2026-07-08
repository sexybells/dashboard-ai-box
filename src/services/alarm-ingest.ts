import { hashPayload } from "@/lib/aibox/hash";
import { persistAlarmImage, type ImagePersistenceResult } from "@/lib/aibox/image-storage";
import { normalizeAiBoxAlarm, type NormalizedAlarmInput } from "@/lib/aibox/normalize";
import { connectMongo } from "@/lib/mongodb";
import { AlarmModel } from "@/models/alarm";
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
  ): Promise<{ id: string }>;
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
  ): Promise<{ id: string }> {
    await connectMongo();
    const created = await AlarmModel.create(alarm);
    return { id: String(created._id) };
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
  const created = await repo.createAlarm({
    ...normalized,
    imageKind: image.kind,
    imageUrl: image.publicUrl,
    imagePath: image.localPath,
    imageOriginal: image.original ?? normalized.imageOriginal
  });

  return {
    ok: true,
    duplicate: false,
    id: created.id
  };
}
