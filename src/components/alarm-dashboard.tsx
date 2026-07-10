"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import {
  formatAlarmDate,
  formatAlarmTime,
  getAlarmListEmptyMessage,
  getRealtimeStatusLabel,
  type RealtimeStatus
} from "@/components/alarm-display";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status-pill";
import { getWebhookUrl } from "@/lib/webhook-url";
import type { AlarmRealtimeEvent } from "@/services/alarm-events";
import {
  fetchAlarmList,
  type AlarmFilters,
  type AlarmListItem,
  type AlarmListResponse
} from "@/services/alarm-client";
import { mergeRealtimeAlarm } from "@/services/realtime-alarm-list";

const emptyResponse: AlarmListResponse = {
  data: [],
  total: 0,
  allTotal: 0,
  page: 1,
  limit: 20,
  totalPages: 0
};

const inputClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "grid gap-1.5 text-xs font-medium text-muted-foreground";

function uniqueValues(items: AlarmListItem[], key: keyof AlarmListItem): string[] {
  return Array.from(
    new Set(items.map((item) => item[key]).filter((value): value is string => typeof value === "string" && value.length > 0))
  ).sort((a, b) => a.localeCompare(b));
}

export function AlarmDashboard() {
  const [filters, setFilters] = useState<AlarmFilters>({
    q: "",
    taskSession: "",
    summary: "",
    mediaName: ""
  });
  const [data, setData] = useState<AlarmListResponse>(emptyResponse);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [webhookUrl, setWebhookUrl] = useState(getWebhookUrl());
  const [highlightedAlarmIds, setHighlightedAlarmIds] = useState<Set<string>>(() => new Set());
  const [newAlarmCount, setNewAlarmCount] = useState(0);
  const dataRef = useRef<AlarmListResponse>(emptyResponse);
  const highlightTimersRef = useRef<number[]>([]);

  const clearHighlightTimers = useCallback(() => {
    for (const timer of highlightTimersRef.current) {
      window.clearTimeout(timer);
    }
    highlightTimersRef.current = [];
  }, []);

  const markAlarmHighlighted = useCallback((id: string) => {
    setHighlightedAlarmIds((current) => new Set(current).add(id));
    const timer = window.setTimeout(() => {
      setHighlightedAlarmIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 5000);
    highlightTimersRef.current.push(timer);
  }, []);

  const loadAlarms = useCallback(async () => {
    try {
      const result = await fetchAlarmList(filters);
      dataRef.current = result;
      setData(result);
      setNewAlarmCount(0);
      clearHighlightTimers();
      setHighlightedAlarmIds(new Set());
      setLastUpdated(new Date());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load alarms");
    } finally {
      setIsLoading(false);
    }
  }, [clearHighlightTimers, filters]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadAlarms();
    }, 0);
    const timer = window.setInterval(() => {
      void loadAlarms();
    }, 30000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadAlarms]);

  useEffect(() => {
    const webhookUrlTimer = window.setTimeout(() => {
      setWebhookUrl(getWebhookUrl(window.location.origin));
    }, 0);

    const source = new EventSource("/api/alarms/stream");

    source.addEventListener("ready", () => {
      setRealtimeStatus("live");
    });

    source.addEventListener("alarm-created", (event) => {
      setRealtimeStatus("live");
      const message = event as MessageEvent<string>;
      let payload: AlarmRealtimeEvent | null = null;

      try {
        payload = JSON.parse(message.data) as AlarmRealtimeEvent;
      } catch {
        void loadAlarms();
        return;
      }

      if (!payload.alarm) {
        void loadAlarms();
        return;
      }

      const hadAlarm = dataRef.current.data.some((alarm) => alarm.id === payload?.alarm?.id);
      const result = mergeRealtimeAlarm(dataRef.current, payload.alarm, filters, dataRef.current.limit);
      dataRef.current = result.data;
      setData(result.data);
      setIsLoading(false);
      setLastUpdated(new Date());
      setError(null);

      if (!hadAlarm) {
        setNewAlarmCount((current) => current + 1);
      }

      if (result.highlightedId) {
        markAlarmHighlighted(result.highlightedId);
      }
    });

    source.onerror = () => {
      setRealtimeStatus("offline");
    };

    return () => {
      window.clearTimeout(webhookUrlTimer);
      source.close();
    };
  }, [filters, loadAlarms, markAlarmHighlighted]);

  useEffect(() => {
    return () => {
      clearHighlightTimers();
    };
  }, [clearHighlightTimers]);

  const taskSessions = uniqueValues(data.data, "taskSession");
  const summaries = uniqueValues(data.data, "summary");
  const cameras = uniqueValues(data.data, "mediaName");
  const hasActiveFilters = Boolean(filters.q || filters.taskSession || filters.summary || filters.mediaName);
  const rowCountLabel = `${data.data.length.toLocaleString("vi-VN")} dòng`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Giám sát thời gian thực</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Bảng điều khiển cảnh báo AI Box</h2>
        </div>
        <div className="flex items-center gap-2.5">
          <StatusPill status={realtimeStatus} />
          <button
            type="button"
            onClick={() => void loadAlarms()}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="size-4" />
            Làm mới
          </button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-brand p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">URL nhận cảnh báo</p>
          <p className="mt-1 break-all font-mono text-sm">{webhookUrl}</p>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(webhookUrl)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          <Copy className="size-4" />
          Sao chép
        </button>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng cảnh báo" value={data.allTotal.toLocaleString("vi-VN")} />
        <StatCard label="Theo bộ lọc" value={data.total.toLocaleString("vi-VN")} />
        <StatCard label="Đang hiển thị" value={data.data.length.toLocaleString("vi-VN")} />
        <StatCard
          label="Cập nhật lần cuối"
          value={lastUpdated ? formatAlarmDate(lastUpdated.toISOString()) : "-"}
          hint={getRealtimeStatusLabel(realtimeStatus)}
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass}>
            Tìm kiếm
            <input
              className={inputClass}
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="Mã cảnh báo, tác vụ, camera..."
            />
          </label>
          <label className={labelClass}>
            Tác vụ
            <select
              className={inputClass}
              value={filters.taskSession}
              onChange={(event) => setFilters((current) => ({ ...current, taskSession: event.target.value }))}
            >
              <option value="">Tất cả tác vụ</option>
              {taskSessions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Loại cảnh báo
            <select
              className={inputClass}
              value={filters.summary}
              onChange={(event) => setFilters((current) => ({ ...current, summary: event.target.value }))}
            >
              <option value="">Tất cả loại cảnh báo</option>
              {summaries.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Camera
            <select
              className={inputClass}
              value={filters.mediaName}
              onChange={(event) => setFilters((current) => ({ ...current, mediaName: event.target.value }))}
            >
              <option value="">Tất cả camera</option>
              {cameras.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold tracking-tight">Cảnh báo gần đây</h3>
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            {newAlarmCount > 0 ? (
              <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-semibold text-success">
                {newAlarmCount.toLocaleString("vi-VN")} cảnh báo mới
              </span>
            ) : null}
            {isLoading ? <span>Đang tải...</span> : <span>{rowCountLabel}</span>}
          </div>
        </div>

        {error ? (
          <div className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Ảnh</th>
                <th className="px-4 py-3">Tác vụ</th>
                <th className="px-4 py-3">Camera</th>
                <th className="px-4 py-3">Cảnh báo</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((alarm) => (
                <tr
                  key={alarm.id}
                  className={cnRow(highlightedAlarmIds.has(alarm.id))}
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-[11px] text-muted-foreground">
                      {alarm.imageUrl ? (
                        <Image
                          src={alarm.imageUrl}
                          alt={alarm.summary || "Cảnh báo AI Box"}
                          width={96}
                          height={64}
                          unoptimized
                          className="size-full object-cover"
                        />
                      ) : (
                        <span>{alarm.imageKind}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span className="block font-medium break-words">{alarm.taskSession || "-"}</span>
                    <span className="mt-0.5 block max-w-[280px] truncate text-xs text-muted-foreground">
                      {alarm.taskDesc || alarm.boardIp || ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span className="block font-medium break-words">{alarm.mediaName || "-"}</span>
                    <span className="mt-0.5 block max-w-[280px] truncate text-xs text-muted-foreground">
                      {alarm.mediaUrl || ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span className="block font-medium break-words">{alarm.summary || "-"}</span>
                    <span className="mt-0.5 block max-w-[280px] truncate text-xs text-muted-foreground">
                      {alarm.description || ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">{formatAlarmTime(alarm.time, alarm.timeText)}</td>
                  <td className="px-4 py-3 align-middle">
                    <Link className="font-medium text-brand hover:underline" href={`/alarms/${alarm.id}`}>
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              ))}
              {!isLoading && data.data.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                      {getAlarmListEmptyMessage(hasActiveFilters)}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Row style with a fade highlight for newly-arrived alarms.
function cnRow(highlighted: boolean): string {
  return highlighted
    ? "border-b border-border bg-success/10 transition-colors"
    : "border-b border-border transition-colors hover:bg-muted/40";
}
