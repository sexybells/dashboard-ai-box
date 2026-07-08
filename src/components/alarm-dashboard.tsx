"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getWebhookUrl } from "@/lib/webhook-url";
import {
  fetchAlarmList,
  type AlarmFilters,
  type AlarmListItem,
  type AlarmListResponse
} from "@/services/alarm-client";

type RealtimeStatus = "connecting" | "live" | "offline";

const emptyResponse: AlarmListResponse = {
  data: [],
  total: 0,
  allTotal: 0,
  page: 1,
  limit: 20,
  totalPages: 0
};

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

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

  const loadAlarms = useCallback(async () => {
    try {
      const result = await fetchAlarmList(filters);
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load alarms");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

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

    source.addEventListener("alarm-created", () => {
      setRealtimeStatus("live");
      void loadAlarms();
    });

    source.onerror = () => {
      setRealtimeStatus("offline");
    };

    return () => {
      window.clearTimeout(webhookUrlTimer);
      source.close();
    };
  }, [loadAlarms]);

  const taskSessions = uniqueValues(data.data, "taskSession");
  const summaries = uniqueValues(data.data, "summary");
  const cameras = uniqueValues(data.data, "mediaName");
  const realtimeLabel = realtimeStatus === "live" ? "Live" : realtimeStatus === "offline" ? "Offline" : "Connecting";

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Local LAN</p>
          <h1>AI Box Alarm Dashboard</h1>
        </div>
        <button className="button" type="button" onClick={() => void loadAlarms()}>
          Refresh
        </button>
      </div>

      <section className="webhook-banner">
        <div>
          <span>Alarm Listener URL</span>
          <strong>{webhookUrl}</strong>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigator.clipboard.writeText(webhookUrl)}
        >
          Copy
        </button>
      </section>

      <section className="metric-grid">
        <div className="metric">
          <span>Total alarms</span>
          <strong>{data.allTotal.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="metric">
          <span>Filtered</span>
          <strong>{data.total.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="metric">
          <span>Visible</span>
          <strong>{data.data.length.toLocaleString("vi-VN")}</strong>
        </div>
        <div className="metric">
          <span>Last updated</span>
          <strong>{lastUpdated ? formatDate(lastUpdated.toISOString()) : "-"}</strong>
        </div>
        <div className="metric">
          <span>Realtime</span>
          <strong className={`status-text ${realtimeStatus}`}>{realtimeLabel}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="filter-grid">
          <label>
            Search
            <input
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="AlarmId, task, camera..."
            />
          </label>
          <label>
            Task
            <select
              value={filters.taskSession}
              onChange={(event) =>
                setFilters((current) => ({ ...current, taskSession: event.target.value }))
              }
            >
              <option value="">All tasks</option>
              {taskSessions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Summary
            <select
              value={filters.summary}
              onChange={(event) =>
                setFilters((current) => ({ ...current, summary: event.target.value }))
              }
            >
              <option value="">All summaries</option>
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
              <option value="">All cameras</option>
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
          <h2>Recent alarms</h2>
          {isLoading ? <span>Loading...</span> : <span>{data.data.length} rows</span>}
        </div>

        {error ? <div className="alert">{error}</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Task</th>
                <th>Camera</th>
                <th>Alarm</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data.map((alarm) => (
                <tr key={alarm.id}>
                  <td>
                    <div className="thumb">
                      {alarm.imageUrl ? (
                        <Image
                          src={alarm.imageUrl}
                          alt={alarm.summary || "AI Box alarm"}
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
                  <td>{formatDate(alarm.time || alarm.timeText)}</td>
                  <td>
                    <Link className="text-link" href={`/alarms/${alarm.id}`}>
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
              {!isLoading && data.data.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">No alarms yet. Trigger an AI Box task callback.</div>
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
