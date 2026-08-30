import { describe, expect, it } from "vitest";
import {
  COUNTING_SUMMARIES,
  FACEIDCOUNT_SUMMARY,
  HEADCOUNT_SUMMARY,
  NON_ALARM_SUMMARIES,
  PEOPLECROSS_SUMMARY
} from "./event-types";

// The two lists are not complements of each other. They were one constant once,
// used with opposite meanings; these cases pin down the intended membership.
describe("event summary lists", () => {
  it("keeps both crossing counters out of the alarm list while still counting them as footfall", () => {
    // They are in BOTH lists: hidden from Cảnh báo, but still the footfall
    // source. The box emits thousands of crossings a day, and they already
    // surface as the visitor count via the headcount-forward webhook.
    for (const summary of [PEOPLECROSS_SUMMARY, HEADCOUNT_SUMMARY]) {
      expect(NON_ALARM_SUMMARIES).toContain(summary);
      expect(COUNTING_SUMMARIES).toContain(summary);
    }
  });

  it("keeps the FaceIdCount heartbeat out of both the alarm list and footfall", () => {
    expect(NON_ALARM_SUMMARIES).toContain(FACEIDCOUNT_SUMMARY);
    expect(COUNTING_SUMMARIES).not.toContain(FACEIDCOUNT_SUMMARY);
  });

  it("hides exactly the two crossing counters plus the heartbeat", () => {
    expect([...NON_ALARM_SUMMARIES].sort()).toEqual(
      [HEADCOUNT_SUMMARY, PEOPLECROSS_SUMMARY, FACEIDCOUNT_SUMMARY].sort()
    );
  });
});
