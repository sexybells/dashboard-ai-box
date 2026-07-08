import { handleAiBoxWebhookRequest } from "@/app/api/webhooks/aibox/handler";

export const runtime = "nodejs";

export const POST = handleAiBoxWebhookRequest;
