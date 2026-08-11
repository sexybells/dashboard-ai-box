"use client";

import { VideoOff } from "lucide-react";
import { HlsPlayer } from "@/components/camera/hls-player";
import { buildHlsLiveUrl, publicHlsBase } from "@/lib/aibox/media-endpoints";
import { cn } from "@/lib/cn";
import type { CameraListItem } from "@/services/camera-client";

// Lưới xem tất cả camera bằng HLS. URL media dựng phía client từ
// NEXT_PUBLIC_MEDIA_HLS_BASE (Next inline lúc build) — không cần gọi
// /api/cameras/[code]/live cho từng tile. Bấm tile → mở chế độ xem 1 camera.

interface CameraGridProps {
  cameras: CameraListItem[];
  onSelect: (code: string) => void;
}

export function CameraGrid({ cameras, onSelect }: CameraGridProps) {
  if (cameras.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border">
        <p className="text-sm text-muted-foreground">Chưa cấu hình camera nào</p>
      </div>
    );
  }

  // 1 cam chiếm hết khung; nhiều cam chia lưới 2-3 cột theo bề ngang.
  const gridClass =
    cameras.length === 1
      ? "grid-cols-1"
      : cameras.length <= 4
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={cn("grid gap-4", gridClass)}>
      {cameras.map((cam) => (
        <button
          key={cam.code}
          type="button"
          onClick={() => onSelect(cam.code)}
          className="group relative overflow-hidden rounded-xl border border-border bg-black text-left transition hover:border-primary/60"
        >
          <div className="aspect-video">
            {cam.online ? (
              <HlsPlayer src={buildHlsLiveUrl(publicHlsBase(), cam.code)} className="size-full" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2">
                <VideoOff className="size-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Camera mất kết nối</p>
              </div>
            )}
          </div>
          {/* Dải tên + trạng thái đè lên đáy tile. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
            <span
              className={cn(
                "size-2 rounded-full",
                cam.online ? "bg-emerald-500" : "bg-destructive"
              )}
            />
            <span className="text-sm font-medium text-white">{cam.name}</span>
            {cam.location ? <span className="text-xs text-white/70">{cam.location}</span> : null}
          </div>
        </button>
      ))}
    </div>
  );
}
