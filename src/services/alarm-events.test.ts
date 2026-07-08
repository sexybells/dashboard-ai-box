import { describe, expect, it, beforeEach } from "vitest";
import {
  publishAlarmEvent,
  resetAlarmEventsForTests,
  subscribeToAlarmEvents
} from "./alarm-events";

describe("alarm realtime events", () => {
  beforeEach(() => {
    resetAlarmEventsForTests();
  });

  it("broadcasts alarm-created events to active subscribers", () => {
    const received: string[] = [];

    subscribeToAlarmEvents((event) => {
      received.push(event.id);
    });

    publishAlarmEvent({
      type: "alarm-created",
      id: "alarm-1",
      occurredAt: "2026-07-08T09:00:00.000Z"
    });

    expect(received).toEqual(["alarm-1"]);
  });

  it("stops sending events after unsubscribe", () => {
    const received: string[] = [];
    const unsubscribe = subscribeToAlarmEvents((event) => {
      received.push(event.id);
    });

    unsubscribe();

    publishAlarmEvent({
      type: "alarm-created",
      id: "alarm-2",
      occurredAt: "2026-07-08T09:00:00.000Z"
    });

    expect(received).toEqual([]);
  });
});
