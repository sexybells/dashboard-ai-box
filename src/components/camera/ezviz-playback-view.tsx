"use client";

import { useCallback, useEffect, useState } from "react";
import { EzvizPlayer } from "@/components/camera/ezviz-player";
import { cn } from "@/lib/cn";
import type { CameraListItem } from "@/services/camera-client";
import { fetchEzvizPlaybackRanges, type EzvizPlaybackRange } from "@/services/ezviz-client";

// Xem lại camera EZVIZ. Video nằm trên cloud EZVIZ (recType=2) chứ không phải
// trên đĩa server, nên không dùng thanh tua tự viết của MediaMTX — player
// EZUIKit có sẵn điều khiển tua. Phần dưới đây chỉ trả lời "ngày nào, giờ nào
// có video", lấy từ /api/ezviz/cameras/[code]/playback.

/** Ngày hôm nay theo múi giờ máy người xem, dạng YYYY-MM-DD cho <input type=date>. */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function dayBounds(day: string): { from: Date; to: Date } {
  // "T00:00:00" không có Z → giờ LOCAL, đúng ý người xem đang chọn ngày.
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from.getTime() + 86_400_000);
  return { from, to };
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function EzvizPlaybackView({ cameras }: { cameras: CameraListItem[] }) {
  const [code, setCode] = useState(cameras[0]?.code ?? "");
  const [day, setDay] = useState(todayKey());
  const [ranges, setRanges] = useState<EzvizPlaybackRange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mốc đang phát. Null = player mở nhưng chưa phát, chờ người dùng chọn khoảng.
  const [begin, setBegin] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!code) return;
    setRanges(null);
    setError(null);
    // Đổi camera hoặc đổi ngày thì mốc cũ không còn nghĩa gì.
    setBegin(null);
    try {
      const result = await fetchEzvizPlaybackRanges(code, dayBounds(day));
      setRanges(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách video");
    }
  }, [code, day]);

  // IIFE: tránh setState đồng bộ ngay trong thân effect (mẫu footfall-view).
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (cameras.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border">
        <p className="text-sm text-muted-foreground">Chưa có camera EZVIZ nào</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        >
          {cameras.map((cam) => (
            <option key={cam.code} value={cam.code}>
              {cam.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={day}
          max={todayKey()}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        />
      </div>

      <div className="h-[calc(100dvh-22rem)] min-h-[16rem] overflow-hidden rounded-xl border border-border bg-black">
        {code ? <EzvizPlayer code={code} kind="rec" begin={begin ?? undefined} /> : null}
      </div>

      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Khoảng có video trên cloud EZVIZ — bấm để phát
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!error && ranges === null ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : null}
        {ranges !== null && ranges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ngày này không có video</p>
        ) : null}
        {ranges !== null && ranges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {ranges.map((range) => {
              const active = begin?.toISOString() === range.start;
              return (
                <button
                  key={range.start}
                  type="button"
                  onClick={() => setBegin(new Date(range.start))}
                  title="Phát từ mốc này"
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-xs transition",
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-border text-muted-foreground hover:border-brand/60 hover:text-foreground"
                  )}
                >
                  {formatClock(range.start)}–{formatClock(range.end)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
