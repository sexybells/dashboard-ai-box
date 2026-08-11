"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HlsPlayer } from "@/components/camera/hls-player";
import { useLiveUrls } from "@/components/camera/use-live-urls";
import { WebrtcPlayer } from "@/components/camera/webrtc-player";
import { cn } from "@/lib/cn";
import type { CameraListItem } from "@/services/camera-client";

// Xem 1 camera toàn khung: ưu tiên WebRTC (độ trễ <1s), tự fallback HLS khi
// WebRTC không nối được (vd UDP bị chặn sau NAT — đúng cái bẫy đã ghi trong
// camera-embed.tsx). Reader WHEP tự retry lỗi tạm; chỉ fallback khi lỗi lặp
// lại mà chưa từng nhận track nào.

const WEBRTC_ERRORS_BEFORE_FALLBACK = 2;

/**
 * Reader WHEP có một đường chết hẳn không retry (lỗi ngay lúc dò codec) — khi
 * đó onError chỉ bắn 1 lần, không bao giờ đủ ngưỡng đếm lỗi ở trên. Chốt chặn
 * cuối: quá hạn này chưa nhận track nào thì ép chuyển HLS.
 */
const WEBRTC_CONNECT_TIMEOUT_MS = 8000;

interface CameraSingleViewProps {
  camera: CameraListItem;
  onBack: () => void;
}

export function CameraSingleView({ camera, onBack }: CameraSingleViewProps) {
  const [transport, setTransport] = useState<"webrtc" | "hls">("webrtc");
  const { live, error: liveError } = useLiveUrls(camera.code);
  const errorCount = useRef(0);
  const connected = useRef(false);

  const handleWebrtcError = useCallback(() => {
    if (connected.current) return; // đã từng phát được → để reader tự retry
    errorCount.current += 1;
    if (errorCount.current >= WEBRTC_ERRORS_BEFORE_FALLBACK) {
      setTransport("hls");
    }
  }, []);

  const handleConnected = useCallback(() => {
    connected.current = true;
  }, []);

  // Chốt chặn cuối cho fallback: hết hạn mà chưa từng nhận track → HLS.
  // Chỉ đếm giờ khi đã có URL (live) — kẻo trừ oan thời gian chờ /live.
  useEffect(() => {
    if (transport !== "webrtc" || !camera.online || !live) return;
    const timer = setTimeout(() => {
      if (!connected.current) setTransport("hls");
    }, WEBRTC_CONNECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [transport, camera.online, live]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Tất cả camera
        </button>
        <div className="flex items-center gap-2">
          <span
            className={cn("size-2 rounded-full", camera.online ? "bg-emerald-500" : "bg-destructive")}
          />
          <span className="text-sm font-medium">{camera.name}</span>
          {camera.location ? (
            <span className="text-xs text-muted-foreground">{camera.location}</span>
          ) : null}
        </div>
        <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          {transport === "webrtc" ? "WebRTC" : "HLS"}
        </span>
      </div>

      <div className="h-[calc(100dvh-14rem)] min-h-[20rem] overflow-hidden rounded-xl border border-border bg-black">
        {!camera.online ? (
          <div className="flex size-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Camera mất kết nối</p>
          </div>
        ) : !live ? (
          <div className="flex size-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {liveError ? "Không tải được cấu hình luồng" : "Đang tải…"}
            </p>
          </div>
        ) : transport === "webrtc" ? (
          <WebrtcPlayer
            whepUrl={live.webrtc}
            auth={live.auth}
            onError={handleWebrtcError}
            onConnected={handleConnected}
            className="size-full"
          />
        ) : (
          <HlsPlayer src={live.hls} auth={live.auth} muted={false} className="size-full" />
        )}
      </div>
    </div>
  );
}
