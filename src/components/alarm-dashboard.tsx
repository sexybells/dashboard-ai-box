"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import {
  formatAlarmDate,
  getAlarmListEmptyMessage,
  getRealtimeStatusLabel,
  type RealtimeStatus
} from "@/components/alarm-display";
import { AlarmTable } from "@/components/alarm-table";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status-pill";
import { getPageRange } from "@/lib/pagination";
import { getWebhookUrl } from "@/lib/webhook-url";
import type { AlarmRealtimeEvent } from "@/services/alarm-events";
import {
  deleteAlarms,
  fetchAlarmList,
  ALARM_PAGE_SIZE,
  type AlarmFilters,
  type AlarmListItem,
  type AlarmListResponse
} from "@/services/alarm-client";
import {
  pruneSelection,
  toggleAllSelection,
  toggleSelection
} from "@/services/alarm-selection";
import { mergeRealtimeAlarm, removeAlarmsFromList } from "@/services/realtime-alarm-list";

const emptyResponse: AlarmListResponse = {
  data: [],
  total: 0,
  allTotal: 0,
  page: 1,
  limit: ALARM_PAGE_SIZE,
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

interface PendingDeletion {
  ids: string[];
  description: string;
}

function describeAlarm(alarm: AlarmListItem): string {
  const label = [alarm.summary, alarm.mediaName].filter(Boolean).join(" — ");
  return label || alarm.taskSession || alarm.alarmId || alarm.id;
}

export function AlarmDashboard() {
  const [filters, setFilters] = useState<AlarmFilters>({
    q: "",
    taskSession: "",
    summary: "",
    mediaName: ""
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AlarmListResponse>(emptyResponse);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [webhookUrl, setWebhookUrl] = useState(getWebhookUrl());
  const [highlightedAlarmIds, setHighlightedAlarmIds] = useState<Set<string>>(() => new Set());
  const [newAlarmCount, setNewAlarmCount] = useState(0);
  const [selectedAlarmIds, setSelectedAlarmIds] = useState<Set<string>>(() => new Set());
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  // Filters describe a different result set, so any change restarts at page 1.
  const updateFilters = useCallback((change: Partial<AlarmFilters>) => {
    setFilters((current) => ({ ...current, ...change }));
    setPage(1);
  }, []);

  const loadAlarms = useCallback(async () => {
    try {
      const result = await fetchAlarmList(filters, page);

      // Deleting the last rows of the final page shrinks the range under foot;
      // step back and let the page change trigger a fresh load.
      if (result.totalPages > 0 && page > result.totalPages) {
        setPage(result.totalPages);
        return;
      }

      dataRef.current = result;
      setData(result);
      // Rows can disappear between refreshes; keep only ids still on screen.
      setSelectedAlarmIds((current) =>
        pruneSelection(current, result.data.map((alarm) => alarm.id))
      );
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
  }, [clearHighlightTimers, filters, page]);

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

      // Newest alarms belong at the top of page 1; on any other page the list
      // stays put and only the counter moves, so the user keeps their place.
      if (page !== 1) {
        setNewAlarmCount((current) => current + 1);
        setLastUpdated(new Date());
        return;
      }

      const hadAlarm = dataRef.current.data.some((alarm) => alarm.id === payload?.alarm?.id);
      const result = mergeRealtimeAlarm(dataRef.current, payload.alarm, filters, dataRef.current.limit);
      dataRef.current = result.data;
      setData(result.data);
      setSelectedAlarmIds((current) =>
        pruneSelection(current, result.data.data.map((alarm) => alarm.id))
      );
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
  }, [filters, loadAlarms, markAlarmHighlighted, page]);

  useEffect(() => {
    return () => {
      clearHighlightTimers();
    };
  }, [clearHighlightTimers]);

  const confirmDeletion = useCallback(async () => {
    if (!pendingDeletion) return;

    setIsDeleting(true);
    try {
      await deleteAlarms(pendingDeletion.ids);

      const deletedIds = new Set(pendingDeletion.ids);
      const result = removeAlarmsFromList(dataRef.current, deletedIds);
      dataRef.current = result;
      setData(result);
      setSelectedAlarmIds((current) => pruneSelection(current, result.data.map((alarm) => alarm.id)));
      setPendingDeletion(null);
      setError(null);
      // The page now has a gap: refetch so rows from the next page move up.
      void loadAlarms();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Xoá cảnh báo thất bại");
      setPendingDeletion(null);
    } finally {
      setIsDeleting(false);
    }
  }, [loadAlarms, pendingDeletion]);

  const taskSessions = uniqueValues(data.data, "taskSession");
  const summaries = uniqueValues(data.data, "summary");
  const cameras = uniqueValues(data.data, "mediaName");
  const hasActiveFilters = Boolean(filters.q || filters.taskSession || filters.summary || filters.mediaName);
  const isInitialLoading = isLoading && data.data.length === 0;
  const selectedCount = selectedAlarmIds.size;
  const range = getPageRange(data.page, data.limit, data.data.length, data.total);
  const rowCountLabel =
    range.total === 0
      ? "0 dòng"
      : `${range.from.toLocaleString("vi-VN")}–${range.to.toLocaleString("vi-VN")} trên ${range.total.toLocaleString("vi-VN")}`;

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
              onChange={(event) => updateFilters({ q: event.target.value })}
              placeholder="Mã cảnh báo, tác vụ, camera..."
            />
          </label>
          <label className={labelClass}>
            Tác vụ
            <select
              className={inputClass}
              value={filters.taskSession}
              onChange={(event) => updateFilters({ taskSession: event.target.value })}
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
              onChange={(event) => updateFilters({ summary: event.target.value })}
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
              onChange={(event) => updateFilters({ mediaName: event.target.value })}
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
            {selectedCount > 0 ? (
              <>
                <span className="font-semibold text-foreground">
                  Đã chọn {selectedCount.toLocaleString("vi-VN")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingDeletion({
                      ids: [...selectedAlarmIds],
                      description: `${selectedCount.toLocaleString("vi-VN")} cảnh báo đã chọn sẽ bị xoá vĩnh viễn.`
                    })
                  }
                  disabled={isDeleting}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Trash2 className="size-3.5" />
                  Xoá đã chọn
                </button>
              </>
            ) : null}
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

        {isInitialLoading ? (
          <div className="px-5 py-6">
            <LoadingState
              label="Đang tải cảnh báo"
              description="Đang lấy danh sách cảnh báo từ server"
              rows={5}
              className="min-h-[300px] border-dashed"
            />
          </div>
        ) : (
          <AlarmTable
            alarms={data.data}
            highlightedAlarmIds={highlightedAlarmIds}
            selectedAlarmIds={selectedAlarmIds}
            isDeleting={isDeleting}
            emptyMessage={getAlarmListEmptyMessage(hasActiveFilters)}
            showEmptyState={!isLoading && data.data.length === 0}
            onToggleAlarm={(id) => setSelectedAlarmIds((current) => toggleSelection(current, id))}
            onToggleAll={() =>
              setSelectedAlarmIds((current) =>
                toggleAllSelection(current, data.data.map((alarm) => alarm.id))
              )
            }
            onDeleteAlarm={(alarm) =>
              setPendingDeletion({
                ids: [alarm.id],
                description: `Cảnh báo "${describeAlarm(alarm)}" sẽ bị xoá vĩnh viễn.`
              })
            }
          />
        )}

        {data.totalPages > 1 && !isInitialLoading ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
            <span className="text-xs text-muted-foreground">
              Trang {data.page.toLocaleString("vi-VN")} / {data.totalPages.toLocaleString("vi-VN")}
            </span>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              disabled={isDeleting}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={pendingDeletion !== null}
        title="Xoá cảnh báo?"
        description={`${pendingDeletion?.description ?? ""} Hành động này không thể hoàn tác.`}
        isBusy={isDeleting}
        onConfirm={() => void confirmDeletion()}
        onCancel={() => setPendingDeletion(null)}
      />
    </div>
  );
}
