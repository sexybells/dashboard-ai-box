"use client";

import { useCallback, useRef } from "react";
import {
  computeTimelineSpans,
  fracToTime,
  type RecordingRange
} from "@/lib/aibox/recording-timeline";
import { cn } from "@/lib/cn";

// Thanh tua kiểu NVR: dải xanh = có ghi hình, nền trống = hở. Bấm/kéo vào bất
// kỳ đâu để nhảy tới mốc thời gian đó (cha lo đổi mốc → cửa sổ /get).

interface RecordingTimelineProps {
  /** Các khoảng ĐÃ hàn (mergeRanges) để dải vẽ liền mạch. */
  ranges: RecordingRange[];
  viewStart: Date;
  viewEnd: Date;
  /** Vị trí đang phát (nếu có) để vẽ kim đỏ. */
  cursor: Date | null;
  onSeek: (time: Date) => void;
  className?: string;
}

/** Mốc giờ chẵn trong cửa sổ nhìn để kẻ vạch + nhãn. */
function hourTicks(viewStart: Date, viewEnd: Date): Date[] {
  const ticks: Date[] = [];
  const t = new Date(viewStart);
  t.setMinutes(0, 0, 0);
  if (t < viewStart) t.setHours(t.getHours() + 1);
  // Cửa sổ 24h → 25 vạch là nhiều nhất; hiện nhãn cách 3 tiếng cho thoáng.
  while (t <= viewEnd) {
    ticks.push(new Date(t));
    t.setHours(t.getHours() + 1);
  }
  return ticks;
}

function frac(time: Date, viewStart: Date, viewEnd: Date): number {
  return (time.getTime() - viewStart.getTime()) / (viewEnd.getTime() - viewStart.getTime());
}

export function RecordingTimeline({
  ranges,
  viewStart,
  viewEnd,
  cursor,
  onSeek,
  className
}: RecordingTimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const spans = computeTimelineSpans(ranges, viewStart, viewEnd);
  const ticks = hourTicks(viewStart, viewEnd);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      if (rect.width === 0) return;
      onSeek(fracToTime((clientX - rect.left) / rect.width, viewStart, viewEnd));
    },
    [onSeek, viewStart, viewEnd]
  );

  const cursorFrac = cursor ? frac(cursor, viewStart, viewEnd) : null;

  return (
    <div className={cn("select-none", className)}>
      <div
        ref={barRef}
        onPointerDown={(e) => seekFromPointer(e.clientX)}
        className="relative h-10 cursor-pointer overflow-hidden rounded-md border border-border bg-muted/40"
      >
        {/* Dải có ghi hình */}
        {spans.map((span, i) => (
          <div
            key={i}
            className="absolute inset-y-0 bg-primary/50"
            style={{ left: `${span.offsetFrac * 100}%`, width: `${span.widthFrac * 100}%` }}
          />
        ))}
        {/* Vạch giờ */}
        {ticks.map((tick) => {
          const f = frac(tick, viewStart, viewEnd);
          return (
            <div
              key={tick.getTime()}
              className="absolute inset-y-0 w-px bg-border/70"
              style={{ left: `${f * 100}%` }}
            />
          );
        })}
        {/* Kim vị trí đang phát */}
        {cursorFrac !== null && cursorFrac >= 0 && cursorFrac <= 1 ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-destructive"
            style={{ left: `${cursorFrac * 100}%` }}
          />
        ) : null}
      </div>
      {/* Nhãn giờ — cách 3 tiếng cho khỏi chen chúc */}
      <div className="relative mt-1 h-4 text-[10px] text-muted-foreground">
        {ticks
          .filter((tick) => tick.getHours() % 3 === 0)
          .map((tick) => (
            <span
              key={tick.getTime()}
              className="absolute -translate-x-1/2"
              style={{ left: `${frac(tick, viewStart, viewEnd) * 100}%` }}
            >
              {tick.getHours().toString().padStart(2, "0")}h
            </span>
          ))}
      </div>
    </div>
  );
}
