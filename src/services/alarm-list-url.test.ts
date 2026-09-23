import { describe, expect, it } from "vitest";
import {
  alarmDetailHref,
  alarmListHrefFromDetail,
  buildAlarmListSearch,
  parseAlarmListState
} from "./alarm-list-url";

const noFilters = { q: "", taskSession: "", summary: "", mediaName: "" };

describe("alarm list URL state", () => {
  it("round-trips filters and page through the query string", () => {
    const state = {
      filters: { q: "cổng", taskSession: "Task A&B", summary: "Intrude", mediaName: "C28-Lễ Tân" },
      page: 3
    };
    expect(parseAlarmListState(new URLSearchParams(buildAlarmListSearch(state)))).toEqual(state);
  });

  it("uses a clean URL for the default view", () => {
    expect(buildAlarmListSearch({ filters: noFilters, page: 1 })).toBe("");
  });

  it("reads Next.js searchParams objects and ignores junk pages", () => {
    expect(parseAlarmListState({ taskSession: ["t1", "t2"], page: "abc" })).toEqual({
      filters: { ...noFilters, taskSession: "t1" },
      page: 1
    });
    expect(parseAlarmListState({ page: "-4" }).page).toBe(1);
    expect(parseAlarmListState({ page: "2.5" }).page).toBe(1);
  });

  it("carries the list view to the detail page and back", () => {
    const search = buildAlarmListSearch({ filters: { ...noFilters, taskSession: "Task 1" }, page: 2 });
    const detail = new URL(alarmDetailHref("abc123", search), "http://x");
    expect(detail.pathname).toBe("/alarms/abc123");
    expect(alarmListHrefFromDetail(detail.searchParams.get("from") ?? undefined)).toBe(
      "/alarms?taskSession=Task+1&page=2"
    );
  });

  it("links to the plain detail page when the list is unfiltered", () => {
    expect(alarmDetailHref("abc123", "")).toBe("/alarms/abc123");
    expect(alarmListHrefFromDetail(undefined)).toBe("/alarms");
  });

  it("keeps only known list parameters from `from`", () => {
    expect(alarmListHrefFromDetail("next=https://evil.example&summary=Fire")).toBe("/alarms?summary=Fire");
    expect(alarmListHrefFromDetail("//evil.example")).toBe("/alarms");
  });
});
