import type { AlarmFilters } from "./alarm-client";

/**
 * The /alarms view (filters + page) lives in the URL so that leaving for an
 * alarm's detail page and coming back — via "Quay lại", the browser's back
 * button or after deleting — lands on the same task/type/camera and page.
 */
export interface AlarmListState {
  filters: AlarmFilters;
  page: number;
}

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

const FILTER_KEYS = ["q", "taskSession", "summary", "mediaName"] as const;

// Enough for any real filter value; keeps a crafted URL from bloating state.
const MAX_VALUE_LENGTH = 200;

function readParam(params: SearchParamsLike, key: string): string {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim().slice(0, MAX_VALUE_LENGTH) : "";
}

export function parseAlarmListState(params: SearchParamsLike): AlarmListState {
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, readParam(params, key)])) as unknown as AlarmFilters;
  const page = Number(readParam(params, "page"));
  return { filters, page: Number.isInteger(page) && page > 1 ? page : 1 };
}

/** Query string (no leading "?") for the view; empty for the default view. */
export function buildAlarmListSearch({ filters, page }: AlarmListState): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  return params.toString();
}

export function alarmListHref(search: string): string {
  return search ? `/alarms?${search}` : "/alarms";
}

/** Detail link that remembers which list view it was opened from. */
export function alarmDetailHref(id: string, listSearch: string): string {
  const path = `/alarms/${encodeURIComponent(id)}`;
  return listSearch ? `${path}?${new URLSearchParams({ from: listSearch })}` : path;
}

/**
 * Where the detail page returns to. `from` is re-parsed and rebuilt rather than
 * used verbatim, so only known list parameters survive and the link can never
 * point anywhere but /alarms.
 */
export function alarmListHrefFromDetail(from: string | string[] | undefined): string {
  const raw = Array.isArray(from) ? from[0] : from;
  if (!raw) return "/alarms";
  return alarmListHref(buildAlarmListSearch(parseAlarmListState(new URLSearchParams(raw))));
}
