import { ingestAiBoxWebhook } from "@/services/alarm-ingest";
import { publishAlarmEvent } from "@/services/alarm-events";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
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
        occurredAt: new Date().toISOString()
      });
    }
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook ingestion failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
