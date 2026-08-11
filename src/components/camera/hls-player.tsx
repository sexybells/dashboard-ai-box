"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Player HLS live: Safari phát HLS native qua <video src>, Chrome/Firefox cần
// MSE + hls.js. Bắt buộc hls.destroy() khi unmount — React 19 StrictMode mount
// đôi trong dev, thiếu cleanup là rò một instance Hls mỗi lần remount.

interface HlsPlayerProps {
  src: string;
  /** Grid tile phải muted để trình duyệt cho autoplay. */
  muted?: boolean;
  className?: string;
  /** Báo lỗi lên cha (vd single-view muốn hiển thị khác grid). */
  onError?: (message: string) => void;
}

export function HlsPlayer({ src, muted = true, className, onError }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setFailed(null);

    // Safari: HLS native, không cần hls.js.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      const msg = "Trình duyệt không hỗ trợ phát HLS";
      // queueMicrotask: không setState đồng bộ ngay trong thân effect.
      queueMicrotask(() => {
        setFailed(msg);
        onError?.(msg);
      });
      return;
    }

    const hls = new Hls({ lowLatencyMode: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      // Lỗi mạng (MediaMTX khởi động lại, đứt mạng) thì thử nối lại thay vì
      // chết hẳn; lỗi khác mới báo hỏng.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }
      const msg = "Không phát được luồng camera";
      setFailed(msg);
      onError?.(msg);
    });

    return () => {
      hls.destroy();
    };
  }, [src, onError]);

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        className="size-full object-contain"
      />
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-3 text-center">
          <p className="text-xs text-muted-foreground">{failed}</p>
        </div>
      ) : null}
    </div>
  );
}
