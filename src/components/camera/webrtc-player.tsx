"use client";

import { useEffect, useRef, useState } from "react";
import { MediaMTXWebRTCReader } from "@/lib/aibox/webrtc-whep-reader";
import { cn } from "@/lib/cn";

// Player WebRTC (WHEP) độ trễ thấp cho chế độ xem 1 camera. Bọc reader chính
// chủ của MediaMTX; reader tự retry lỗi tạm thời. Cha có thể dựa vào onError
// liên tiếp để fallback sang HLS (xem camera-single-view).

interface WebrtcPlayerProps {
  whepUrl: string;
  className?: string;
  /** Gọi mỗi lần reader báo lỗi (kể cả lỗi tạm thời trước khi retry). */
  onError?: (message: string) => void;
  /** Gọi khi nhận được track video — tín hiệu kết nối thành công. */
  onConnected?: () => void;
}

export function WebrtcPlayer({ whepUrl, className, onError, onConnected }: WebrtcPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [connecting, setConnecting] = useState(true);

  // Giữ callback trong ref để không phải hủy/tạo lại reader khi cha re-render
  // với closure mới (đổi whepUrl mới đáng khởi động lại kết nối). Cập nhật
  // trong effect (không deps = chạy sau mỗi render) thay vì lúc render.
  const onErrorRef = useRef(onError);
  const onConnectedRef = useRef(onConnected);
  useEffect(() => {
    onErrorRef.current = onError;
    onConnectedRef.current = onConnected;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !whepUrl) return;
    setConnecting(true);

    const reader = new MediaMTXWebRTCReader({
      url: whepUrl,
      onTrack: (evt) => {
        setConnecting(false);
        video.srcObject = evt.streams[0];
        onConnectedRef.current?.();
      },
      onError: (err) => {
        setConnecting(true);
        onErrorRef.current?.(err);
      }
    });

    return () => {
      reader.close();
      video.srcObject = null;
    };
  }, [whepUrl]);

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <video ref={videoRef} autoPlay muted playsInline className="size-full object-contain" />
      {connecting ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
          <p className="text-sm text-muted-foreground">Đang kết nối WebRTC…</p>
        </div>
      ) : null}
    </div>
  );
}
