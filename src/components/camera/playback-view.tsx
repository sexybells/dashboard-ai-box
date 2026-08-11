"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RecordingTimeline } from "@/components/camera/recording-timeline";
import {
  mergeRanges,
  parseRecordingRanges,
  resolvePlaybackWindow,
  type PlaybackWindow
} from "@/lib/aibox/recording-timeline";
import { cn } from "@/lib/cn";
import {
  buildPlaybackStreamUrl,
  fetchRecordingRanges,
  type CameraListItem
} from "@/services/camera-client";

// Tua lại kiểu NVR: chọn camera + ngày → thanh tua hiện các khoảng đã ghi →
// bấm vào mốc bất kỳ → phát fMP4 liên tục từ mốc đó tới hết khoảng liền mạch
// (MediaMTX /get nối các segment sẵn). Hết cửa sổ (video ended) thì tự nhảy
// sang khoảng kế tiếp nếu có.

/** Ngày hôm nay theo múi giờ máy người xem, dạng YYYY-MM-DD cho <input type=date>. */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

interface PlaybackViewProps {
  cameras: CameraListItem[];
}

export function PlaybackView({ cameras }: PlaybackViewProps) {
  const [code, setCode] = useState(cameras[0]?.code ?? "");
  const [day, setDay] = useState(todayKey());
  const [rangesRaw, setRangesRaw] = useState<{ start: string; duration: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackWindow | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Số thứ tự request: response về trễ của camera/ngày cũ bị bỏ, không đè
  // timeline hiện tại (đổi cam nhanh khi /list của MediaMTX đang chậm).
  const requestSeq = useRef(0);

  // <input type=date> trả YYYY-MM-DD; new Date("...T00:00:00") = 0h LOCAL —
  // đúng ngày theo múi giờ người xem, khớp nhãn giờ trên thanh tua.
  const viewStart = useMemo(() => new Date(`${day}T00:00:00`), [day]);
  const viewEnd = useMemo(() => new Date(viewStart.getTime() + 24 * 3600 * 1000), [viewStart]);

  const merged = useMemo(
    () => (rangesRaw ? mergeRanges(parseRecordingRanges(rangesRaw)) : []),
    [rangesRaw]
  );

  const loadRanges = useCallback(async () => {
    if (!code) return;
    const seq = ++requestSeq.current;
    setError(null);
    try {
      const ranges = await fetchRecordingRanges(code, { from: viewStart, to: viewEnd });
      if (seq !== requestSeq.current) return; // đã có request mới hơn → bỏ
      setRangesRaw(ranges);
    } catch {
      if (seq !== requestSeq.current) return;
      setRangesRaw(null);
      setError("Không tải được danh sách ghi hình");
    }
  }, [code, viewStart, viewEnd]);

  // Đổi camera/ngày → tải khoảng ghi hình mới (dừng phát đã làm ngay trong
  // onChange để không có render nào ghép code mới với cửa sổ phát cũ).
  useEffect(() => {
    void (async () => {
      await loadRanges();
    })();
  }, [loadRanges]);

  /** Reset trạng thái phát — gọi ngay khi đổi camera/ngày. */
  const resetPlayback = useCallback(() => {
    setPlayback(null);
    setCursor(null);
    setError(null);
    setRangesRaw(null);
  }, []);

  const seekTo = useCallback(
    (target: Date) => {
      const win = resolvePlaybackWindow(merged, target);
      setPlayback(win);
      setCursor(win?.start ?? null);
      if (!win) setError("Không có ghi hình sau thời điểm này");
      else setError(null);
    },
    [merged]
  );

  // Video phát tới đâu, kim tua theo tới đó.
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !playback) return;
    setCursor(new Date(playback.start.getTime() + video.currentTime * 1000));
  }, [playback]);

  // Hết cửa sổ liên tục → tự nhảy sang khoảng kế tiếp (sau 1ms để thoát khoảng cũ).
  const handleEnded = useCallback(() => {
    if (!playback) return;
    const afterEnd = new Date(playback.start.getTime() + playback.durationSec * 1000 + 1);
    const win = resolvePlaybackWindow(merged, afterEnd);
    if (win) {
      setPlayback(win);
      setCursor(win.start);
    }
  }, [playback, merged]);

  const streamUrl = playback
    ? buildPlaybackStreamUrl(code, { start: playback.start, durationSec: playback.durationSec })
    : null;

  return (
    <div className="space-y-3">
      {/* Bộ chọn camera + ngày */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={code}
          onChange={(e) => {
            resetPlayback();
            setCode(e.target.value);
          }}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
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
          onChange={(e) => {
            if (!e.target.value) return;
            resetPlayback();
            setDay(e.target.value);
          }}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void loadRanges()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className="size-4" />
          Làm mới
        </button>
        {cursor ? (
          <span className="ml-auto font-mono text-sm text-muted-foreground">
            {cursor.toLocaleTimeString("vi-VN")}
          </span>
        ) : null}
      </div>

      {/* Khung phát */}
      <div className="relative h-[calc(100dvh-21rem)] min-h-[16rem] overflow-hidden rounded-xl border border-border bg-black">
        {streamUrl ? (
          <video
            key={streamUrl} // đổi cửa sổ → element mới, load từ đầu stream mới
            ref={videoRef}
            src={streamUrl}
            autoPlay
            controls
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={() => {
              // /get lỗi (segment đã bị dọn theo retention, hở đúng chỗ hàn,
              // MediaMTX sập giữa chừng) → video bắn error chứ không ended.
              // Không xử lý thì màn đen đứng im không thông báo.
              setPlayback(null);
              setError("Không phát được đoạn ghi hình này — thử bấm mốc khác trên thanh thời gian");
            }}
            className="size-full object-contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">
              {merged.length === 0
                ? rangesRaw === null && !error
                  ? "Đang tải…"
                  : "Chưa có ghi hình trong ngày này"
                : "Bấm vào thanh thời gian bên dưới để xem lại"}
            </p>
          </div>
        )}
      </div>

      {/* Thanh tua */}
      <RecordingTimeline
        ranges={merged}
        viewStart={viewStart}
        viewEnd={viewEnd}
        cursor={cursor}
        onSeek={seekTo}
      />

      {error ? <p className={cn("text-sm text-destructive")}>{error}</p> : null}
    </div>
  );
}
