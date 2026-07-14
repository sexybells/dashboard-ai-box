"use client";

import type { ApexOptions } from "apexcharts";
import { useEffect, useState } from "react";

export const CHART_BRAND = "#2563eb"; // blue-600, matches --brand

/** Track the `dark` class on <html> so charts re-theme with the toggle. */
export function useIsDark(): boolean {
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

export function axisColor(dark: boolean): string {
  return dark ? "#a3a3a3" : "#6b7280";
}

export function baseChartOptions(dark: boolean): ApexOptions {
  return {
    chart: { toolbar: { show: false }, fontFamily: "inherit", background: "transparent" },
    theme: { mode: dark ? "dark" : "light" },
    grid: { borderColor: dark ? "#2a2a2a" : "#ececec", strokeDashArray: 4 },
    tooltip: { theme: dark ? "dark" : "light" },
    dataLabels: { enabled: false },
    legend: { labels: { colors: dark ? "#e5e5e5" : "#525252" } }
  };
}
