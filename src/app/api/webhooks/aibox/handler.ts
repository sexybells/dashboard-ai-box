import { publishAlarmEvent } from "@/services/alarm-events";
import { ingestAiBoxWebhook } from "@/services/alarm-ingest";
import { NextRequest, NextResponse } from "next/server";

const FORWARD_TIMEOUT_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Mirrors the raw payload to a secondary deployment (e.g. the IP-only site running
// against its own database) so both stay in sync without the AI Box device needing
// to send two webhooks. No-op unless AIBOX_WEBHOOK_FORWARD_URL is configured.
async function forwardWebhookPayload(payload: Record<string, unknown>): Promise<void> {
  const forwardUrl = process.env.AIBOX_WEBHOOK_FORWARD_URL;
  if (!forwardUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

  try {
    await fetch(forwardUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    console.error("[webhooks/aibox] forward to secondary site failed:", error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleAiBoxWebhookRequest(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return NextResponse.json({ ok: false, error: "JSON body must be an object" }, { status: 400 });
  }

  try {
    const result = await ingestAiBoxWebhook(payload);
    if (!result.duplicate) {
      publishAlarmEvent({
        type: "alarm-created",
        id: result.id,
        occurredAt: new Date().toISOString(),
        alarm: result.alarm
      });
    }
    void forwardWebhookPayload(payload);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook ingestion failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
