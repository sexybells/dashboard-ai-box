"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

// ApexCharts touches `window`, so load it client-only.
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface ApexChartProps {
  type: "area" | "bar" | "donut";
  series: ApexOptions["series"];
  options: ApexOptions;
  height?: number;
}

export function ApexChart({ type, series, options, height = 280 }: ApexChartProps) {
  return <ReactApexChart type={type} series={series} options={options} height={height} width="100%" />;
}
