import { NON_ALARM_SUMMARIES } from "@/lib/aibox/event-types";
import type { AlarmListItem } from "./alarm-client";

/**
 * Choices for the Tác vụ / Loại cảnh báo / Camera dropdowns on /alarms.
 *
 * They come from every stored alarm (GET /api/alarms/filter-options), not from
 * the rows on the current page — otherwise a type that only appears on page 5
 * could never be picked, and picking one collapsed the list to that one value.
 */
export interface AlarmFilterOptions {
  taskSessions: string[];
  summaries: string[];
  mediaNames: string[];
}

export const emptyAlarmFilterOptions: AlarmFilterOptions = {
  taskSessions: [],
  summaries: [],
  mediaNames: []
};

/** Deduplicates, drops blanks/non-strings and sorts the way the dropdowns show them. */
export function normalizeOptionValues(values: readonly unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function addValue(values: string[], value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed || values.includes(trimmed)) return values;
  return normalizeOptionValues([...values, trimmed]);
}

/**
 * Folds a realtime alarm into the options so a brand-new camera or alarm type
 * is selectable right away instead of after the next refresh. Counting traffic
 * never reaches the Cảnh báo list, so it must not leak into the choices either.
 */
export function mergeAlarmIntoFilterOptions(
  options: AlarmFilterOptions,
  alarm: AlarmListItem
): AlarmFilterOptions {
  const hidden: readonly string[] = NON_ALARM_SUMMARIES;
  if (alarm.summary && hidden.includes(alarm.summary)) return options;

  const next: AlarmFilterOptions = {
    taskSessions: addValue(options.taskSessions, alarm.taskSession),
    summaries: addValue(options.summaries, alarm.summary),
    mediaNames: addValue(options.mediaNames, alarm.mediaName)
  };

  const changed =
    next.taskSessions !== options.taskSessions ||
    next.summaries !== options.summaries ||
    next.mediaNames !== options.mediaNames;
  return changed ? next : options;
}

/**
 * Keeps the active selection in its dropdown even when no stored alarm carries
 * it any more (e.g. its last rows were just deleted) — a <select> whose value
 * has no matching <option> silently displays the first option instead.
 */
export function withSelectedOption(values: readonly string[], selected: string): string[] {
  const trimmed = selected.trim();
  if (!trimmed || values.includes(trimmed)) return [...values];
  return normalizeOptionValues([...values, trimmed]);
}
