import { describe, expect, it } from "vitest";
import { getWebhookUrl } from "./webhook-url";

describe("getWebhookUrl", () => {
  it("returns a relative webhook path without browser origin", () => {
    expect(getWebhookUrl()).toBe("/api/webhooks/aibox");
  });

  it("returns an absolute webhook URL for a public origin", () => {
    expect(getWebhookUrl("https://aibox-dashboard.onrender.com")).toBe(
      "https://aibox-dashboard.onrender.com/api/webhooks/aibox"
    );
  });
});
