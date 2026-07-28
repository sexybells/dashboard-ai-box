import { describe, expect, it } from "vitest";
import { buildAlarmListQuery } from "./alarm-client";

describe("alarm client API helpers", () => {
  it("builds a compact alarm list query from active filters", () => {
    expect(
      buildAlarmListQuery({
        q: " gate ",
        taskSession: "",
        summary: "People Counting",
        mediaName: "camera-01"
      })
    ).toBe("page=1&limit=30&q=gate&summary=People+Counting&mediaName=camera-01");
  });

  it("requests the given page", () => {
    expect(buildAlarmListQuery({ q: "", taskSession: "", summary: "", mediaName: "" }, 4)).toBe(
      "page=4&limit=30"
    );
  });
});
