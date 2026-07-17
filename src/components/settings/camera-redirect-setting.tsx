"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CameraRedirectSetting() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/camera-redirect")
      .then((r) => r.json())
      .then((d: { cameraRedirectUrl?: string | null }) => {
        if (!cancelled) setValue(d.cameraRedirectUrl ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được cấu hình hiện tại");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/camera-redirect", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cameraRedirectUrl: value })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        cameraRedirectUrl?: string | null;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Lưu không thành công");
        return;
      }
      // Rỗng = đã xoá cấu hình; đồng bộ ô nhập với giá trị server đã chuẩn hoá.
      setValue(data.cameraRedirectUrl ?? "");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch {
      setError("Lưu không thành công");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link mở giao diện box</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Link mở ra khi bấm vào khung camera trực tiếp. Giữ nguyên path và hash nên trỏ thẳng vào
          deep link của box được, ví dụ{" "}
          <code className="font-mono">http://192.168.1.26/#/preview/video</code>. Để trống thì dùng
          địa chỉ AI Box ở trên.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading || saving}
            placeholder="http://192.168.1.26/#/preview/video"
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground disabled:opacity-50"
          />
          <button
            type="button"
            onClick={save}
            disabled={loading || saving}
            className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : saved ? "Đã lưu" : "Lưu"}
          </button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
