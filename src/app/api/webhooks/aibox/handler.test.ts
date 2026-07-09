import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { publishAlarmEvent } from "@/services/alarm-events";
import { ingestAiBoxWebhook } from "@/services/alarm-ingest";
import { handleAiBoxWebhookRequest } from "./handler";

vi.mock("@/services/alarm-events", () => ({
  publishAlarmEvent: vi.fn()
}));

vi.mock("@/services/alarm-ingest", () => ({
  ingestAiBoxWebhook: vi.fn()
}));

const alarm = {
  id: "new-id",
  taskSession: "Gate",
  summary: "People",
  mediaName: "Camera 1",
  imageKind: "none" as const,
  time: "2026-07-09T02:00:00.000Z"
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/aibox", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("handleAiBoxWebhookRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes a realtime event with serialized alarm data for new alarms", async () => {
    vi.mocked(ingestAiBoxWebhook).mockResolvedValue({
      ok: true,
      duplicate: false,
      id: "new-id",
      alarm
    });

    const response = await handleAiBoxWebhookRequest(makeRequest({ UniqueId: "new-id" }));

    expect(response.status).toBe(201);
    expect(publishAlarmEvent).toHaveBeenCalledWith({
      type: "alarm-created",
      id: "new-id",
      occurredAt: expect.any(String),
      alarm
    });
  });

  it("does not publish realtime events for duplicate alarms", async () => {
    vi.mocked(ingestAiBoxWebhook).mockResolvedValue({
      ok: true,
      duplicate: true,
      id: "existing-id"
    });

    const response = await handleAiBoxWebhookRequest(makeRequest({ UniqueId: "existing-id" }));

    expect(response.status).toBe(200);
    expect(publishAlarmEvent).not.toHaveBeenCalled();
  });
});
