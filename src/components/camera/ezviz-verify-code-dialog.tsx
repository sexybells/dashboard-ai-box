"use client";

import { useState } from "react";
import { saveVerifyCode } from "@/services/ezviz-client";

// Nhập mã xác minh in trên tem camera. Cần vì device/list của EZVIZ không trả
// mã này — không có cách nào lấy tự động.

interface EzvizVerifyCodeDialogProps {
  code: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EzvizVerifyCodeDialog({ code, onClose, onSaved }: EzvizVerifyCodeDialogProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await saveVerifyCode(code, value.trim().toUpperCase());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được mã xác minh");
      setSaving(false);
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">Mã xác minh camera</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Dãy chữ in trên tem dán ở thân hoặc đáy camera (thường 6 ký tự in hoa).
          </p>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim() && !saving) void submit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="ABCDEF"
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm uppercase"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !value.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
