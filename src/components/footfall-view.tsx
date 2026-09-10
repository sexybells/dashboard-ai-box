"use client";

import { CalendarRange, Clock, LogIn, LogOut, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ApexChart } from "@/components/charts/apex-chart";
import { CHART_BRAND, axisColor, baseChartOptions, useIsDark } from "@/components/charts/chart-theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { fetchFootfall, type FootfallResponse, type Granularity } from "@/services/footfall-client";

const IN_COLOR = "#10b981"; // emerald-500, the raw "Vào" crossings
const OUT_COLOR = "#f59e0b"; // amber-500, the raw "Ra" crossings

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

export function FootfallView() {
  const initialTo = todayKey();
  const [from, setFrom] = useState(() => shiftDay(initialTo, -29));
  const [to, setTo] = useState(initialTo);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [day, setDay] = useState(initialTo); // day for the hourly drill
  const [data, setData] = useState<FootfallResponse | null>(null);
  const [hourly, setHourly] = useState<FootfallResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dark = useIsDark();

  useEffect(() => {
    let active = true;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchFootfall({ from, to, granularity });
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await fetchFootfall({ from: day, to: day, granularity: "day", day });
        if (active) setHourly(result);
      } catch {
        if (active) setHourly(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [day]);

  const base = baseChartOptions(dark);
  const axis = axisColor(dark);
  const series = data?.series ?? [];
  const unit = GRANULARITY_OPTIONS.find((o) => o.value === granularity)?.unit ?? "kỳ";
  // Khách còn ở bên trong: In chưa ghép được Out nào (xem countVisitPairs).
  const inside = (data?.totalIn ?? 0) - (data?.totalOut ?? 0);
  const hours = hourly?.hourly ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Lưu lượng khách</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Lượt khách</h2>
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
        Một lượt khách = 1 lượt vào ghép với 1 lượt ra, ghép riêng theo từng camera trong từng ngày.
        Vào chưa có ra tương ứng thì chưa tính (khách còn ở bên trong). Số đếm từ People Counting —
        ước tính, phụ thuộc cách bố trí vạch/camera.
      </p>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : isLoading && !data ? (
        <LoadingState label="Đang tải số liệu" description="Đang tổng hợp lượt vào/ra theo thời gian" rows={3} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Tổng lượt khách"
              value={String(data?.totalVisits ?? 0)}
              icon={Users}
              hint={`${from} → ${to}`}
            />
            <StatCard
              label="Tổng lượt vào"
              value={String(data?.totalIn ?? 0)}
              icon={LogIn}
              hint={inside > 0 ? `${inside} lượt vào chưa có lượt ra` : `${from} → ${to}`}
            />
            <StatCard
              label="Tổng lượt ra"
              value={String(data?.totalOut ?? 0)}
              icon={LogOut}
              hint={`${from} → ${to}`}
            />
            <StatCard
              label="Cao điểm"
              value={String(data?.peak?.visits ?? 0)}
              icon={CalendarRange}
              hint={data?.peak ? `Kỳ ${data.peak.label} · nhiều lượt khách nhất` : "—"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Lượt khách theo {unit}</CardTitle>
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
                  series={[
                    { name: "Lượt khách", data: series.map((b) => b.visits) },
                    { name: "Vào", data: series.map((b) => b.in) },
                    { name: "Ra", data: series.map((b) => b.out) }
                  ]}
                  options={{
                    ...base,
                    colors: [CHART_BRAND, IN_COLOR, OUT_COLOR],
                    plotOptions: { bar: { columnWidth: "80%", borderRadius: 3 } },
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

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" /> Giờ cao điểm trong ngày (vào / ra)
                </span>
                <input
                  type="date"
                  value={day}
                  max={todayKey()}
                  onChange={(e) => setDay(e.target.value)}
                  className="rounded-md border border-border bg-card px-2 py-1 text-sm font-normal text-foreground"
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hours.every((h) => h.in === 0 && h.out === 0) ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Không có lượt nào trong ngày {day}.
                </p>
              ) : (
                <ApexChart
                  type="bar"
                  height={300}
                  series={[
                    { name: "Vào", data: hours.map((h) => h.in) },
                    { name: "Ra", data: hours.map((h) => h.out) }
                  ]}
                  options={{
                    ...base,
                    colors: [IN_COLOR, OUT_COLOR],
                    plotOptions: { bar: { columnWidth: "60%", borderRadius: 2 } },
                    xaxis: {
                      categories: hours.map((h) => `${h.hour}h`),
                      labels: { style: { colors: axis }, rotate: 0, hideOverlappingLabels: true },
                      tickAmount: 12,
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
