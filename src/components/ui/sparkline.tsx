import { cn } from "@/lib/cn";

interface SparklineProps {
  values: number[];
  className?: string;
  height?: number;
}

// Simple dependency-free area sparkline for the Overview trend.
export function Sparkline({ values, className, height = 56 }: SparklineProps) {
  const width = 240;
  if (values.length === 0) {
    return <div className={cn("text-xs text-muted-foreground", className)}>Chưa có dữ liệu</div>;
  }

  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - (value / max) * (height - 4) - 2;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("w-full", className)} preserveAspectRatio="none" role="img" aria-label="Xu hướng cảnh báo">
      <path d={area} fill="var(--brand)" fillOpacity={0.12} />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
