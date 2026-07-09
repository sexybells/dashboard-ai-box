import { describe, expect, it } from "vitest";
import { ingestAiBoxWebhook, type AlarmIngestRepository } from "./alarm-ingest";

function createRepo(existing = false): AlarmIngestRepository & { created: unknown[]; events: unknown[] } {
  return {
    created: [],
    events: [],
    async createWebhookEvent(event) {
      this.events.push(event);
    },
    async findAlarmByDedupeKey() {
      return existing ? { id: "existing-id" } : null;
    },
    async createAlarm(alarm) {
      this.created.push(alarm);
      return { id: "new-id" };
    }
  };
}

describe("ingestAiBoxWebhook", () => {
  it("creates a normalized alarm and logs the raw webhook event", async () => {
    const repo = createRepo(false);

    const result = await ingestAiBoxWebhook(
      {
        UniqueId: "ALARM_123",
        TaskSession: "gate-in",
        Summary: "PeopleNumber",
        Result: { Description: "People Counting" },
        ImageData: "/9j/base64"
      },
      {
        repo,
        persistImage: async () => ({
          kind: "base64",
          localPath: "/tmp/alarm.jpg",
          publicUrl: "/api/alarm-images/alarm.jpg",
          original: "/9j/base64"
        })
      }
    );

    expect(result).toMatchObject({
      ok: true,
      duplicate: false,
      id: "new-id",
      alarm: {
        id: "new-id",
        dedupeKey: "unique:ALARM_123",
        taskSession: "gate-in",
        imageKind: "base64",
        imageUrl: "/api/alarm-images/alarm.jpg"
      }
    });
    expect(repo.events).toHaveLength(1);
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]).toMatchObject({
      dedupeKey: "unique:ALARM_123",
      taskSession: "gate-in",
      imageUrl: "/api/alarm-images/alarm.jpg",
      imagePath: "/tmp/alarm.jpg"
    });
  });

  it("does not create a second alarm when the dedupe key already exists", async () => {
    const repo = createRepo(true);

    const result = await ingestAiBoxWebhook({ UniqueId: "ALARM_123" }, { repo });

    expect(result).toEqual({ ok: true, duplicate: true, id: "existing-id" });
    expect(repo.events).toHaveLength(1);
    expect(repo.created).toHaveLength(0);
  });
});
