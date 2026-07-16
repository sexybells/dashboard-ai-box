"use client";

import { useState, useSyncExternalStore } from "react";
import { Copy } from "lucide-react";
import { BoxHostSetting } from "@/components/settings/box-host-setting";
import { useRealtimeStatus } from "@/components/use-realtime-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { getWebhookUrl } from "@/lib/webhook-url";

export function SettingsView() {
  // Resolve the origin-based webhook URL on the client without setState-in-effect.
  const webhookUrl = useSyncExternalStore(
    () => () => {},
    () => getWebhookUrl(window.location.origin),
    () => getWebhookUrl()
  );
  const [copied, setCopied] = useState(false);
  const realtimeStatus = useRealtimeStatus();

  function copy() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Hệ thống</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Cài đặt</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>URL nhận cảnh báo (Webhook)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cấu hình AI Box gửi callback POST đến địa chỉ này. Không dùng <code className="font-mono">localhost</code> trên
            AI Box.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              <Copy className="size-4" />
              {copied ? "Đã sao chép" : "Sao chép"}
            </button>
          </div>
        </CardContent>
      </Card>

      <BoxHostSetting />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Giao diện</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Chuyển đổi giao diện sáng / tối. Lựa chọn được ghi nhớ.</p>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kết nối realtime</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Trạng thái luồng cảnh báo trực tuyến (SSE).</p>
            <StatusPill status={realtimeStatus} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
