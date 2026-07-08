import { describe, expect, it } from "vitest";
import { formatSseComment, formatSseEvent } from "./sse";

describe("SSE formatting", () => {
  it("formats named JSON events for EventSource clients", () => {
    expect(formatSseEvent("alarm-created", { id: "alarm-1" })).toBe(
      'event: alarm-created\ndata: {"id":"alarm-1"}\n\n'
    );
  });

  it("formats comments for keepalive messages", () => {
    expect(formatSseComment("keepalive")).toBe(": keepalive\n\n");
  });
});
