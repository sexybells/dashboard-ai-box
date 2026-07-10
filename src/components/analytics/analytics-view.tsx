"use client";

import type { ApexOptions } from "apexcharts";
import { useEffect, useState } from "react";
import { ApexChart } from "@/components/charts/apex-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAlarmStats, type AlarmStats } from "@/services/alarm-stats-client";

const BRAND = "#2563eb"; // blue-600, matches --brand

function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function baseOptions(dark: boolean): ApexOptions {
  return {
    chart: { toolbar: { show: false }, fontFamily: "inherit", background: "transparent" },
    theme: { mode: dark ? "dark" : "light" },
    grid: { borderColor: dark ? "#2a2a2a" : "#ececec", strokeDashArray: 4 },
    tooltip: { theme: dark ? "dark" : "light" },
    dataLabels: { enabled: false },
    legend: { labels: { colors: dark ? "#e5e5e5" : "#525252" } }
  };
}

export function AnalyticsView() {
  const [stats, setStats] = useState<AlarmStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = useIsDark();

  useEffect(() => {
    let active = true;
    fetchAlarmStats(30)
      .then((result) => active && setStats(result))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Không tải được thống kê"));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>;
  }

  const base = baseOptions(dark);
  const axisColor = dark ? "#a3a3a3" : "#6b7280";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Phân tích cảnh báo</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Thống kê 30 ngày</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cảnh báo theo ngày</CardTitle>
          </CardHeader>
          <CardContent>
            <ApexChart
              type="area"
              height={300}
              series={[{ name: "Cảnh báo", data: (stats?.perDay ?? []).map((b) => b.count) }]}
              options={{
                ...base,
                colors: [BRAND],
                stroke: { curve: "smooth", width: 2 },
                fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
                xaxis: {
                  categories: (stats?.perDay ?? []).map((b) => b.date.slice(5)),
                  labels: { style: { colors: axisColor }, rotate: 0, hideOverlappingLabels: true },
                  tickAmount: 6,
                  axisBorder: { show: false },
                  axisTicks: { show: false }
                },
                yaxis: { labels: { style: { colors: axisColor } } }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cảnh báo theo giờ</CardTitle>
          </CardHeader>
          <CardContent>
            <ApexChart
              type="bar"
              height={300}
              series={[{ name: "Cảnh báo", data: stats?.byHour ?? [] }]}
              options={{
                ...base,
                colors: [BRAND],
                plotOptions: { bar: { columnWidth: "60%", borderRadius: 3 } },
                xaxis: {
                  categories: Array.from({ length: 24 }, (_, i) => `${i}h`),
                  labels: { style: { colors: axisColor }, hideOverlappingLabels: true },
                  axisBorder: { show: false },
                  axisTicks: { show: false }
                },
                yaxis: { labels: { style: { colors: axisColor } } }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Theo loại cảnh báo</CardTitle>
          </CardHeader>
          <CardContent>
            <ApexChart
              type="donut"
              height={300}
              series={(stats?.byType ?? []).map((b) => b.count)}
              options={{
                ...base,
                labels: (stats?.byType ?? []).map((b) => b.name),
                legend: { position: "bottom", labels: { colors: axisColor } },
                stroke: { width: 0 }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Theo camera</CardTitle>
          </CardHeader>
          <CardContent>
            <ApexChart
              type="bar"
              height={300}
              series={[{ name: "Cảnh báo", data: (stats?.byCamera ?? []).map((b) => b.count) }]}
              options={{
                ...base,
                colors: [BRAND],
                plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "60%" } },
                xaxis: {
                  categories: (stats?.byCamera ?? []).map((b) => b.name),
                  labels: { style: { colors: axisColor } },
                  axisBorder: { show: false },
                  axisTicks: { show: false }
                },
                yaxis: { labels: { style: { colors: axisColor } } }
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
