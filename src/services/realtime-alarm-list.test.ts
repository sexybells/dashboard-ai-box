import { describe, expect, it } from "vitest";
import type { AlarmListItem, AlarmListResponse } from "./alarm-client";
import { alarmMatchesFilters, isHiddenFromAlarmList, mergeRealtimeAlarm } from "./realtime-alarm-list";

const baseResponse: AlarmListResponse = {
  data: [
    {
      id: "old-1",
      taskSession: "Gate",
      summary: "People",
      mediaName: "Camera 1",
      imageKind: "none",
      time: "2026-07-09T02:00:00.000Z"
    }
  ],
  total: 1,
  allTotal: 1,
  page: 1,
  limit: 30,
  totalPages: 1
};

const emptyFilters = {
  q: "",
  taskSession: "",
  summary: "",
  mediaName: ""
};

function makeAlarm(overrides: Partial<AlarmListItem> = {}): AlarmListItem {
  return {
    id: "new-1",
    alarmId: "alarm-123",
    taskSession: "Gate",
    summary: "Vehicle",
    mediaName: "Camera 2",
    imageKind: "base64",
    imageUrl: "/api/alarm-images/new-1.jpg",
    time: "2026-07-09T03:00:00.000Z",
    ...overrides
  };
}

describe("realtime alarm list merging", () => {
  it("prepends a matching new alarm and increments totals", () => {
    const result = mergeRealtimeAlarm(baseResponse, makeAlarm(), emptyFilters, 30);

    expect(result.inserted).toBe(true);
    expect(result.data.data.map((alarm) => alarm.id)).toEqual(["new-1", "old-1"]);
    expect(result.data.total).toBe(2);
    expect(result.data.allTotal).toBe(2);
    expect(result.highlightedId).toBe("new-1");
  });

  it("does not duplicate an alarm already visible in the table", () => {
    const result = mergeRealtimeAlarm(
      {
        ...baseResponse,
        data: [makeAlarm(), ...baseResponse.data],
        total: 2,
        allTotal: 2
      },
      makeAlarm({ summary: "Updated" }),
      emptyFilters,
      30
    );

    expect(result.inserted).toBe(false);
    expect(result.data.data.filter((alarm) => alarm.id === "new-1")).toHaveLength(1);
    expect(result.data.data[0].summary).toBe("Updated");
    expect(result.data.total).toBe(2);
    expect(result.data.allTotal).toBe(2);
  });

  it("increments all total but does not insert rows that miss active filters", () => {
    const result = mergeRealtimeAlarm(
      baseResponse,
      makeAlarm({ taskSession: "Parking" }),
      { ...emptyFilters, taskSession: "Gate" },
      30
    );

    expect(result.inserted).toBe(false);
    expect(result.data.data.map((alarm) => alarm.id)).toEqual(["old-1"]);
    expect(result.data.total).toBe(1);
    expect(result.data.allTotal).toBe(2);
    expect(result.highlightedId).toBeNull();
  });

  it("matches text search against alarm id, task, summary, and camera", () => {
    const alarm = makeAlarm({
      alarmId: "ALARM-987",
      taskSession: "Main Gate",
      summary: "Intrusion",
      mediaName: "North Camera"
    });

    expect(alarmMatchesFilters(alarm, { ...emptyFilters, q: "alarm-987" })).toBe(true);
    expect(alarmMatchesFilters(alarm, { ...emptyFilters, q: "main gate" })).toBe(true);
    expect(alarmMatchesFilters(alarm, { ...emptyFilters, q: "north" })).toBe(true);
    expect(alarmMatchesFilters(alarm, { ...emptyFilters, q: "warehouse" })).toBe(false);
  });
});

describe("isHiddenFromAlarmList", () => {
  const emptyFilters = { q: "", taskSession: "", summary: "", mediaName: "" };
  const headcount = { id: "hc-1", summary: "HeadCount" } as AlarmListItem;
  const fighting = { id: "f-1", summary: "Fighting" } as AlarmListItem;

  it("drops counting traffic when no summary is asked for", () => {
    for (const summary of ["HeadCount", "PeopleCross", "FaceIdCount"]) {
      expect(isHiddenFromAlarmList({ id: "x", summary } as AlarmListItem, emptyFilters)).toBe(true);
    }
  });

  it("keeps real security alarms", () => {
    expect(isHiddenFromAlarmList(fighting, emptyFilters)).toBe(false);
  });

  it("shows counting traffic when that summary is asked for by name", () => {
    expect(isHiddenFromAlarmList(headcount, { ...emptyFilters, summary: "HeadCount" })).toBe(false);
  });

  it("never inserts a hidden alarm, and leaves the totals alone", () => {
    // The stream pushes every event; a HeadCount arriving must not touch the
    // list, the counters, or the highlight.
    const current = {
      data: [fighting],
      page: 1,
      limit: 20,
      total: 1,
      allTotal: 1,
      totalPages: 1
    } as unknown as AlarmListResponse;

    const result = mergeRealtimeAlarm(current, headcount, emptyFilters);
    expect(result.inserted).toBe(false);
    expect(result.highlightedId).toBeNull();
    expect(result.data).toBe(current);
    expect(result.data.total).toBe(1);
    expect(result.data.allTotal).toBe(1);
  });
});
