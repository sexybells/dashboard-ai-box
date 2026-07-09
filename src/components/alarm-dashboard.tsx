"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatAlarmDate,
  getAlarmListEmptyMessage,
  getRealtimeStatusLabel,
  type RealtimeStatus
} from "@/components/alarm-display";
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
  const realtimeLabel = getRealtimeStatusLabel(realtimeStatus);
  const hasActiveFilters = Boolean(filters.q || filters.taskSession || filters.summary || filters.mediaName);
  const rowCountLabel = `${data.data.length.toLocaleString("vi-VN")} dòng`;

  return (
    <main className="page-shell">
      <div className="page-header dashboard-header">
        <div>
          <p className="eyebrow">Giám sát thời gian thực</p>
          <h1>Bảng điều khiển cảnh báo AI Box</h1>
        </div>
        <div className="header-actions">
          <span className={`status-pill ${realtimeStatus}`}>{realtimeLabel}</span>
          <button className="button" type="button" onClick={() => void loadAlarms()}>
            Làm mới
          </button>
        </div>
      </div>

      <section className="webhook-banner">
        <div>
          <span>URL nhận cảnh báo</span>
          <strong>{webhookUrl}</strong>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigator.clipboard.writeText(webhookUrl)}
        >
          Sao chép
        </button>
      </section>

      <section className="metric-grid">
        <div className="metric">
          <span>Tổng cảnh báo</span>
          <strong>{data.allTotal.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="metric">
          <span>Theo bộ lọc</span>
          <strong>{data.total.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="metric">
          <span>Đang hiển thị</span>
          <strong>{data.data.length.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="metric">
          <span>Cập nhật lần cuối</span>
          <strong>{lastUpdated ? formatAlarmDate(lastUpdated.toISOString()) : "-"}</strong>
        </div>
        <div className="metric">
          <span>Kết nối realtime</span>
          <strong className={`status-text ${realtimeStatus}`}>{realtimeLabel}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="filter-grid">
          <label>
            Tìm kiếm
            <input
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="Mã cảnh báo, tác vụ, camera..."
            />
          </label>
          <label>
            Tác vụ
            <select
              value={filters.taskSession}
              onChange={(event) =>
                setFilters((current) => ({ ...current, taskSession: event.target.value }))
              }
            >
              <option value="">Tất cả tác vụ</option>
              {taskSessions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Loại cảnh báo
            <select
              value={filters.summary}
              onChange={(event) =>
                setFilters((current) => ({ ...current, summary: event.target.value }))
              }
            >
              <option value="">Tất cả loại cảnh báo</option>
              {summaries.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Camera
            <select
              value={filters.mediaName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, mediaName: event.target.value }))
              }
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
      </section>

      <section className="panel table-panel">
        <div className="section-heading">
          <h2>Cảnh báo gần đây</h2>
          <div className="heading-meta">
            {newAlarmCount > 0 ? (
              <span className="new-alarm-badge">
                {newAlarmCount.toLocaleString("vi-VN")} cảnh báo mới
              </span>
            ) : null}
            {isLoading ? <span>Đang tải...</span> : <span>{rowCountLabel}</span>}
          </div>
        </div>

        {error ? <div className="alert">{error}</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Tác vụ</th>
                <th>Camera</th>
                <th>Cảnh báo</th>
                <th>Thời gian</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data.map((alarm) => (
                <tr key={alarm.id} className={highlightedAlarmIds.has(alarm.id) ? "new-alarm-row" : undefined}>
                  <td>
                    <div className="thumb">
                      {alarm.imageUrl ? (
                        <Image
                          src={alarm.imageUrl}
                          alt={alarm.summary || "Cảnh báo AI Box"}
                          width={96}
                          height={64}
                          unoptimized
                        />
                      ) : (
                        <span>{alarm.imageKind}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <strong>{alarm.taskSession || "-"}</strong>
                    <small>{alarm.taskDesc || alarm.boardIp || ""}</small>
                  </td>
                  <td>
                    <strong>{alarm.mediaName || "-"}</strong>
                    <small>{alarm.mediaUrl || ""}</small>
                  </td>
                  <td>
                    <strong>{alarm.summary || "-"}</strong>
                    <small>{alarm.description || ""}</small>
                  </td>
                  <td>{formatAlarmDate(alarm.time || alarm.timeText)}</td>
                  <td>
                    <Link className="text-link" href={`/alarms/${alarm.id}`}>
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              ))}
              {!isLoading && data.data.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">{getAlarmListEmptyMessage(hasActiveFilters)}</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
