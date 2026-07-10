"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CalendarClock, Cctv, Tag } from "lucide-react";
import { formatAlarmTime } from "@/components/alarm-display";
import { useRealtimeStatus } from "@/components/use-realtime-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Sparkline } from "@/components/ui/sparkline";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status-pill";
import { fetchAlarmList, type AlarmListItem } from "@/services/alarm-client";
import { fetchAlarmStats, type AlarmStats } from "@/services/alarm-stats-client";

const emptyFilters = { q: "", taskSession: "", summary: "", mediaName: "" };

export function OverviewDashboard() {
  const [stats, setStats] = useState<AlarmStats | null>(null);
  const [recent, setRecent] = useState<AlarmListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const realtimeStatus = useRealtimeStatus();

  useEffect(() => {
    let active = true;
    Promise.all([fetchAlarmStats(30), fetchAlarmList({ ...emptyFilters })])
      .then(([statsResult, listResult]) => {
        if (!active) return;
        setStats(statsResult);
        setRecent(listResult.data.slice(0, 6));
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Không tải được dữ liệu");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const perDayValues = stats?.perDay.map((bucket) => bucket.count) ?? [];
  const isInitialLoading = isLoading && !stats && recent.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Tổng quan hệ thống</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Chào mừng trở lại</h2>
        </div>
        <div className="flex items-center gap-2.5">
          <StatusPill status={realtimeStatus} />
          <Link
            href="/alarms"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Bell className="size-4" />
            Xem cảnh báo
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}

      {isInitialLoading ? (
        <LoadingState
          label="Đang tải tổng quan"
          description="Đang lấy thống kê và cảnh báo mới nhất từ server"
          rows={4}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Tổng cảnh báo" value={(stats?.total ?? 0).toLocaleString("vi-VN")} icon={Bell} />
            <StatCard label="Hôm nay" value={(stats?.today ?? 0).toLocaleString("vi-VN")} icon={CalendarClock} />
            <StatCard label="Số camera" value={(stats?.byCamera.length ?? 0).toLocaleString("vi-VN")} icon={Cctv} />
            <StatCard label="Loại cảnh báo" value={(stats?.byType.length ?? 0).toLocaleString("vi-VN")} icon={Tag} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Cảnh báo 30 ngày qua</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {perDayValues.reduce((sum, value) => sum + value, 0).toLocaleString("vi-VN")} cảnh báo
                </span>
              </CardHeader>
              <CardContent>
                <Sparkline values={perDayValues} height={72} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Camera nhiều cảnh báo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {stats && stats.byCamera.length > 0 ? (
                  stats.byCamera.slice(0, 5).map((bucket) => (
                    <div key={bucket.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{bucket.name}</span>
                      <span className="font-semibold">{bucket.count.toLocaleString("vi-VN")}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold tracking-tight">Cảnh báo mới nhất</h3>
              <Link href="/alarms" className="text-sm font-medium text-brand hover:underline">
                Xem tất cả
              </Link>
            </div>
            <div className="divide-y divide-border">
              {recent.length > 0 ? (
                recent.map((alarm) => (
                  <Link
                    key={alarm.id}
                    href={`/alarms/${alarm.id}`}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <Bell className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{alarm.summary || alarm.taskSession || "Cảnh báo"}</p>
                      <p className="truncate text-xs text-muted-foreground">{alarm.mediaName || alarm.boardIp || ""}</p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {formatAlarmTime(alarm.time, alarm.timeText)}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">Chưa có cảnh báo.</div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
