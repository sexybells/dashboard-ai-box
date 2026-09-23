import { describe, expect, it } from "vitest";
import {
  emptyAlarmFilterOptions,
  mergeAlarmIntoFilterOptions,
  normalizeOptionValues,
  withSelectedOption
} from "./alarm-filter-options";
import type { AlarmListItem } from "./alarm-client";

function alarm(overrides: Partial<AlarmListItem>): AlarmListItem {
  return { id: "a1", imageKind: "none", ...overrides };
}

describe("alarm filter options", () => {
  it("normalizes distinct values: trims, drops blanks and non-strings, sorts", () => {
    expect(normalizeOptionValues([" Cam B", "Cam A", "", null, 3, "Cam B", "  "])).toEqual([
      "Cam A",
      "Cam B"
    ]);
  });

  it("adds the values of a new realtime alarm", () => {
    const options = { taskSessions: ["t1"], summaries: ["Intrusion"], mediaNames: ["Cam A"] };
    expect(
      mergeAlarmIntoFilterOptions(
        options,
        alarm({ taskSession: "t0", summary: "Fire", mediaName: "Cam A" })
      )
    ).toEqual({ taskSessions: ["t0", "t1"], summaries: ["Fire", "Intrusion"], mediaNames: ["Cam A"] });
  });

  it("returns the same object when nothing new arrives", () => {
    const options = { taskSessions: ["t1"], summaries: ["Fire"], mediaNames: ["Cam A"] };
    expect(
      mergeAlarmIntoFilterOptions(options, alarm({ taskSession: "t1", summary: "Fire", mediaName: "Cam A" }))
    ).toBe(options);
  });

  it("ignores counting traffic hidden from the alarm list", () => {
    expect(
      mergeAlarmIntoFilterOptions(
        emptyAlarmFilterOptions,
        alarm({ summary: "FaceIdCount", mediaName: "Cam Z", taskSession: "tz" })
      )
    ).toBe(emptyAlarmFilterOptions);
  });

  it("keeps the active selection selectable after its rows are gone", () => {
    expect(withSelectedOption(["Fire"], "Intrusion")).toEqual(["Fire", "Intrusion"]);
    expect(withSelectedOption(["Fire"], "Fire")).toEqual(["Fire"]);
    expect(withSelectedOption(["Fire"], "")).toEqual(["Fire"]);
  });
});
