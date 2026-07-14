"use client";

import { CalendarRange, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ApexChart } from "@/components/charts/apex-chart";
import { CHART_BRAND, axisColor, baseChartOptions, useIsDark } from "@/components/charts/chart-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import {
  fetchVisitorCounts,
  type Granularity,
  type VisitorCountsResponse
} from "@/services/visitor-counts-client";

const GRANULARITY_OPTIONS: { value: Granularity; label: string; unit: string }[] = [
  { value: "day", label: "Ngày", unit: "ngày" },
  { value: "week", label: "Tuần", unit: "tuần" },
  { value: "month", label: "Tháng", unit: "tháng" }
];

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function shiftDay(key: string, deltaDays: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function VisitorCountsView() {
  const initialTo = todayKey();
  const [from, setFrom] = useState(() => shiftDay(initialTo, -29));
  const [to, setTo] = useState(initialTo);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [data, setData] = useState<VisitorCountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dark = useIsDark();

  useEffect(() => {
    let active = true;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchVisitorCounts({ from, to, granularity });
        if (active) setData(result);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : "Không tải được số liệu");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [from, to, granularity]);

  const base = baseChartOptions(dark);
  const axis = axisColor(dark);
  const series = data?.series ?? [];
  const unit = GRANULARITY_OPTIONS.find((o) => o.value === granularity)?.unit ?? "kỳ";
  const avg = data && data.activePeriods > 0 ? Math.round(data.total / data.activePeriods) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Lưu lượng khách</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Số người đếm được</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Từ
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Đến
            <input
              type="date"
              value={to}
              min={from}
              max={todayKey()}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
            />
          </label>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {GRANULARITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGranularity(opt.value)}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition",
                  granularity === opt.value
                    ? "bg-brand text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Số liệu là ước tính từ nhận diện khuôn mặt (dedup) — có sai số, không phải con số tuyệt đối.
      </p>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : isLoading && !data ? (
        <LoadingState label="Đang tải số liệu" description="Đang tổng hợp số người theo khoảng thời gian" rows={3} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Tổng người (khoảng đã chọn)"
              value={String(data?.total ?? 0)}
              icon={Users}
              hint={`${from} → ${to}`}
            />
            <StatCard
              label="Cao điểm"
              value={String(data?.peak?.count ?? 0)}
              icon={TrendingUp}
              hint={data?.peak ? `Kỳ ${data.peak.label}` : "—"}
            />
            <StatCard
              label={`Trung bình / ${unit}`}
              value={String(avg)}
              icon={CalendarRange}
              hint={`${data?.activePeriods ?? 0} ${unit} có dữ liệu`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Số người theo {unit}</CardTitle>
            </CardHeader>
            <CardContent>
              {series.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Không có dữ liệu trong khoảng thời gian này.
                </p>
              ) : (
                <ApexChart
                  type="bar"
                  height={340}
                  series={[{ name: "Người", data: series.map((b) => b.count) }]}
                  options={{
                    ...base,
                    colors: [CHART_BRAND],
                    plotOptions: { bar: { columnWidth: "55%", borderRadius: 3 } },
                    xaxis: {
                      categories: series.map((b) => b.label),
                      labels: { style: { colors: axis }, rotate: 0, hideOverlappingLabels: true },
                      tickAmount: Math.min(12, series.length),
                      axisBorder: { show: false },
                      axisTicks: { show: false }
                    },
                    yaxis: { labels: { style: { colors: axis } }, forceNiceScale: true }
                  }}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
