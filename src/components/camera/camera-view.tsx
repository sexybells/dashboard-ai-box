"use client";

import { useEffect, useState } from "react";
import { CameraEmbed } from "@/components/camera-embed";
import { CameraGrid } from "@/components/camera/camera-grid";
import { CameraSingleView } from "@/components/camera/camera-single-view";
import { PlaybackView } from "@/components/camera/playback-view";
import { cn } from "@/lib/cn";
import { fetchCameras, type CameraListItem } from "@/services/camera-client";

// Trang Camera 3 tab: Trực tiếp (lưới HLS → bấm vào 1 cam = WebRTC), Xem lại
// (tua NVR qua MediaMTX playback), Giao diện Box (iframe cũ giữ nguyên).
// Chỉ mount tab đang mở — tránh phát ngầm tốn băng thông.

type Tab = "live" | "playback" | "box";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "Trực tiếp" },
  { key: "playback", label: "Xem lại" },
  { key: "box", label: "Giao diện Box" }
];

const STATUS_REFRESH_MS = 30_000;

export function CameraView() {
  const [tab, setTab] = useState<Tab>("live");
  const [cameras, setCameras] = useState<CameraListItem[] | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tải danh sách + trạng thái camera, refresh định kỳ để chấm online đúng.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const list = await fetchCameras();
        if (active) {
          setCameras(list);
          setLoadError(null);
        }
      } catch {
        if (active && cameras === null) setLoadError("Không tải được danh sách camera");
      }
    };
    void load();
    const timer = setInterval(() => void load(), STATUS_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy 1 lần + interval
  }, []);

  const selected = cameras?.find((c) => c.code === selectedCode) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-md px-4 py-1.5 text-sm transition sm:flex-none",
              tab === key
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "live" ? (
        cameras === null ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-border">
            <p className="text-sm text-muted-foreground">{loadError ?? "Đang tải…"}</p>
          </div>
        ) : selected ? (
          <CameraSingleView camera={selected} onBack={() => setSelectedCode(null)} />
        ) : (
          <CameraGrid cameras={cameras} onSelect={setSelectedCode} />
        )
      ) : null}

      {tab === "playback" ? (
        cameras === null ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-border">
            <p className="text-sm text-muted-foreground">{loadError ?? "Đang tải…"}</p>
          </div>
        ) : (
          <PlaybackView cameras={cameras} />
        )
      ) : null}

      {tab === "box" ? <CameraEmbed /> : null}
    </div>
  );
}
