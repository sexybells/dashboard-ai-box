export function getWebhookUrl(origin?: string): string {
  if (!origin) return "/api/webhooks/aibox";
  return `${origin.replace(/\/+$/g, "")}/api/webhooks/aibox`;
}
