"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Cấu hình EZVIZ Open Platform. AppSecret chỉ đi một chiều lên server — GET
// không trả về, nên ô secret luôn rỗng khi tải trang dù đã lưu.

interface EzvizConfigStatus {
  configured: boolean;
  appKey: string;
  areaDomain: string | null;
  hasSubAccount: boolean;
  allowMainToken: boolean;
}

export function EzvizSetting() {
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [status, setStatus] = useState<EzvizConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load(signal?: { cancelled: boolean }) {
    try {
      const res = await fetch("/api/settings/ezviz", { cache: "no-store" });
      const data = (await res.json()) as EzvizConfigStatus;
      if (signal?.cancelled) return;
      setStatus(data);
      setAppKey(data.appKey);
    } catch {
      if (!signal?.cancelled) setError("Không tải được cấu hình hiện tại");
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }

  // IIFE: tránh setState đồng bộ ngay trong thân effect (mẫu footfall-view).
  useEffect(() => {
    const signal = { cancelled: false };
    void (async () => {
      await load(signal);
    })();
    return () => {
      signal.cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/ezviz", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey, appSecret })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Lưu không thành công");
        return;
      }
      setAppSecret("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
      await load();
    } catch {
      setError("Lưu không thành công");
    } finally {
      setSaving(false);
    }
  }

  async function setTokenMode(allowMainToken: boolean) {
    setError(null);
    try {
      const res = await fetch("/api/settings/ezviz", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowMainToken })
      });
      if (!res.ok) {
        setError("Không đổi được chế độ token");
        return;
      }
      await load();
    } catch {
      setError("Không đổi được chế độ token");
    }
  }

  async function clearCache() {
    setError(null);
    try {
      await fetch("/api/settings/ezviz", { method: "DELETE" });
      await load();
    } catch {
      setError("Không xoá được cache");
    }
  }

  const inputClass =
    "min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground disabled:opacity-50";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Camera EZVIZ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          AppKey và AppSecret lấy từ console EZVIZ Open Platform. Region được dò tự động ở lần kết
          nối đầu tiên. AppSecret không hiển thị lại sau khi lưu.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            disabled={loading || saving}
            placeholder="AppKey"
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            disabled={loading || saving}
            placeholder={status?.configured ? "AppSecret (đã lưu — nhập lại để đổi)" : "AppSecret"}
            className={inputClass}
          />
          <button
            type="button"
            onClick={save}
            disabled={loading || saving || !appKey || !appSecret}
            className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : saved ? "Đã lưu" : "Lưu"}
          </button>
        </div>

        {status ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Trạng thái:{" "}
              {status.configured ? (
                <span className="text-foreground">đã cấu hình</span>
              ) : (
                <span className="text-destructive">chưa cấu hình</span>
              )}
              {status.areaDomain ? ` — region ${status.areaDomain}` : ""}
            </p>

            {status.configured && !status.hasSubAccount && !status.allowMainToken ? (
              <p className="text-destructive">
                Chưa có tài khoản con và chưa bật token tài khoản chính — camera EZVIZ chưa phát
                được.
              </p>
            ) : null}

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={status.allowMainToken}
                onChange={(e) => void setTokenMode(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="text-foreground">Dùng token tài khoản chính để phát hình</span>
                <br />
                Bật khi tài khoản con không giải mã được luồng. Đánh đổi: token có quyền trên{" "}
                <strong className="text-destructive">toàn bộ tài khoản EZVIZ</strong> sẽ được gửi
                xuống trình duyệt và ai mở DevTools trên dashboard cũng đọc được, dùng lại được
                trong 7 ngày. Chỉ bật khi dashboard chỉ có người tin cậy truy cập.
              </span>
            </label>
          </div>
        ) : null}

        {status?.areaDomain ? (
          <button
            type="button"
            onClick={clearCache}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Xoá cache token và region (dùng khi dò nhầm region)
          </button>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
