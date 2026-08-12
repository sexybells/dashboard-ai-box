"use client";

import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { createCamera, updateCamera, type CameraListItem } from "@/services/camera-client";

// Form thêm/sửa camera (modal). Thêm: không có `camera`. Sửa: truyền `camera`
// để đổ sẵn tên/vị trí/RTSP. RTSP validate ở server (chống injection) — form
// chỉ chặn rỗng và hiển thị lỗi tiếng Việt từ API.

interface CameraFormDialogProps {
  /** Có = chế độ sửa; không = chế độ thêm. */
  camera?: CameraListItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CameraFormDialog({ camera, onClose, onSaved }: CameraFormDialogProps) {
  const editing = Boolean(camera);
  const [name, setName] = useState(camera?.name ?? "");
  const [location, setLocation] = useState(camera?.location ?? "");
  const [rtspUrl, setRtspUrl] = useState(camera?.rtspUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const input = { name: name.trim(), location: location.trim(), rtspUrl: rtspUrl.trim() };
      if (editing && camera) {
        await updateCamera(camera.code, input);
      } else {
        await createCamera(input);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {editing ? "Sửa camera" : "Thêm camera"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Tên camera</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Camera cổng chính"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Vị trí (tuỳ chọn)</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Tầng 1"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">Link RTSP</span>
            <input
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              placeholder="rtsp://user:pass@192.168.1.10:554/stream"
              spellCheck={false}
              autoComplete="off"
              className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-xs"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Nguồn HEVC/H.265 vẫn dùng được — hệ thống tự chuyển mã H.264 để xem trên trình duyệt.
            </span>
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !name.trim() || !rtspUrl.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? "Lưu" : "Thêm"}
          </button>
        </div>
      </div>
    </div>
  );
}
