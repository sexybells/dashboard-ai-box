"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraEmbed } from "@/components/camera-embed";
import { CameraFormDialog } from "@/components/camera/camera-form-dialog";
import { CameraGrid } from "@/components/camera/camera-grid";
import { CameraSingleView } from "@/components/camera/camera-single-view";
import { PlaybackView } from "@/components/camera/playback-view";
import { cn } from "@/lib/cn";
import { fetchCameras, type CameraListItem } from "@/services/camera-client";

// Trang Camera 3 tab: Trực tiếp (tường NVR + CRUD → bấm 1 cam = WebRTC), Xem
// lại (tua qua MediaMTX playback), Giao diện Box (iframe cũ). Chỉ mount tab
// đang mở để tránh phát ngầm tốn băng thông.

type Tab = "live" | "playback" | "box";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "Trực tiếp" },
  { key: "playback", label: "Xem lại" },
  { key: "box", label: "Giao diện Box" }
];

const STATUS_REFRESH_MS = 30_000;

// Chế độ dialog: đóng | thêm mới | sửa camera cụ thể.
type DialogState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; camera: CameraListItem };

export function CameraView() {
  const [tab, setTab] = useState<Tab>("live");
  const [cameras, setCameras] = useState<CameraListItem[] | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const list = await fetchCameras();
      if (activeRef.current) {
        setCameras(list);
        setLoadError(null);
      }
    } catch {
      if (activeRef.current) setLoadError("Không tải được danh sách camera");
    }
  }, []);

  // Tải danh sách + refresh định kỳ để chấm online đúng.
  useEffect(() => {
    activeRef.current = true;
    // IIFE: tránh setState đồng bộ ngay trong thân effect (mẫu footfall-view).
    void (async () => {
      await load();
    })();
    const timer = setInterval(() => void load(), STATUS_REFRESH_MS);
    return () => {
      activeRef.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const selected = cameras?.find((c) => c.code === selectedCode) ?? null;

  // Sau khi thêm/sửa/xoá: đóng dialog, thoát single-view (phòng khi cam đang
  // xem bị xoá), rồi tải lại danh sách.
  const handleChanged = useCallback(() => {
    setDialog({ mode: "closed" });
    setSelectedCode(null);
    void load();
  }, [load]);

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
          <CameraGrid
            cameras={cameras}
            onSelect={setSelectedCode}
            onAdd={() => setDialog({ mode: "add" })}
            onEdit={(camera) => setDialog({ mode: "edit", camera })}
            onChanged={handleChanged}
          />
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

      {dialog.mode !== "closed" ? (
        <CameraFormDialog
          camera={dialog.mode === "edit" ? dialog.camera : null}
          onClose={() => setDialog({ mode: "closed" })}
          onSaved={handleChanged}
        />
      ) : null}
    </div>
  );
}
