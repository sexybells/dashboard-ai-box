"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { FALLBACK_BOX_HOST } from "@/lib/aibox/box-settings";

// AI Box (ZLMediaKit WebRTC). Host lấy từ cấu hình runtime (Cài đặt → AI Box)
// nên đổi được mà không cần build lại. Dạng URL signaling lấy từ UI box:
// <host>/webrtc?app=<app>&stream=<stream>&type=play
const DEFAULT_CHANNEL = process.env.NEXT_PUBLIC_AIBOX_CHANNEL || "group/1"; // app/stream

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Zlm = any;

// Script player không phụ thuộc host (chỉ URL signaling mới dùng host), nên
// cache theo window là an toàn kể cả khi host đổi giữa chừng.
function loadZlmClient(host: string): Promise<Zlm> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { ZLMRTCClient?: Zlm };
    if (w.ZLMRTCClient) return resolve(w.ZLMRTCClient);
    const s = document.createElement("script");
    s.src = `${host}/dist/ZLMRTCClient.js`;
    s.onload = () => (w.ZLMRTCClient ? resolve(w.ZLMRTCClient) : reject(new Error("ZLMRTCClient not found")));
    s.onerror = () => reject(new Error("load failed"));
    document.body.appendChild(s);
  });
}

export function CameraWebrtc() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const clientRef = useRef<Zlm>(null);
  const [boxHost, setBoxHost] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [cameras, setCameras] = useState<string[]>([]);
  const [channel, setChannel] = useState(DEFAULT_CHANNEL);
  const [pending, setPending] = useState(DEFAULT_CHANNEL);
  const [status, setStatus] = useState("Đang tải cấu hình…");

  // Host cấu hình runtime; lỗi mạng thì vẫn thử host LAN mặc định.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/box-host")
      .then((r) => r.json())
      .then((d: { boxHost?: string }) => {
        if (!cancelled) setBoxHost(d.boxHost || FALLBACK_BOX_HOST);
      })
      .catch(() => {
        if (!cancelled) setBoxHost(FALLBACK_BOX_HOST);
      });
    // Link redirect riêng (Cài đặt → Link mở giao diện box). Không cấu hình
    // hoặc lỗi mạng thì để null, hai link dưới tự quay về host box.
    fetch("/api/settings/camera-redirect")
      .then((r) => r.json())
      .then((d: { cameraRedirectUrl?: string | null }) => {
        if (!cancelled) setRedirectUrl(d.cameraRedirectUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!boxHost) return;
    let cancelled = false;
    fetch(`${boxHost}/api/alg_media_fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    })
      .then((r) => r.json())
      .then((d: { Content?: { MediaName?: string }[] }) => {
        if (cancelled) return;
        const names = (d.Content ?? []).map((m) => m.MediaName).filter((n): n is string => !!n);
        setCameras(names);
      })
      .catch(() => {
        if (!cancelled) setStatus("Không lấy được danh sách camera (cùng LAN với box?)");
      });
    return () => {
      cancelled = true;
    };
  }, [boxHost]);

  useEffect(() => {
    if (!boxHost) return;
    let cancelled = false;
    void (async () => {
      setStatus("Đang kết nối…");
      try {
        const ZLM = await loadZlmClient(boxHost);
        if (cancelled || !videoRef.current) return;
        clientRef.current?.close?.();
        const [app, stream] = channel.split("/");
        const url = `${boxHost}/webrtc?app=${encodeURIComponent(app)}&stream=${encodeURIComponent(stream ?? "")}&type=play`;
        const client = new ZLM.Endpoint({
          element: videoRef.current,
          debug: false,
          zlmsdpUrl: url,
          simulcast: false,
          useCamera: false,
          audioEnable: false,
          videoEnable: true,
          recvOnly: true,
          usedatachannel: false
        });
        client.on(ZLM.Events.WEBRTC_ON_REMOTE_STREAMS, () => !cancelled && setStatus("Đang phát"));
        client.on(ZLM.Events.WEBRTC_ANSWER_EXCHANGE_FAILED, (e: unknown) =>
          !cancelled && setStatus(`Lỗi WebRTC: ${JSON.stringify(e).slice(0, 120)}`)
        );
        clientRef.current = client;
      } catch (e) {
        if (!cancelled) setStatus(`Không tải được player: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      clientRef.current?.close?.();
    };
  }, [channel, boxHost]);

  // Link cấu hình riêng thắng; không có thì giữ nguyên hành vi cũ: nút header
  // vào deep link preview, overlay vào gốc box.
  const headerHref = redirectUrl ?? (boxHost ? `${boxHost}/#/preview/video` : null);
  const overlayHref = redirectUrl ?? boxHost;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Camera</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Xem trực tiếp AI Box</h2>
        </div>
        {headerHref ? (
          <a
            href={headerHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ExternalLink className="size-4" />
            Mở UI box
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {Array.from({ length: Math.max(1, Math.ceil(cameras.length / 9)) }, (_, i) => i + 1).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                const c = `group/${g}`;
                setChannel(c);
                setPending(c);
              }}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition",
                channel === `group/${g}`
                  ? "bg-brand text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Nhóm {g}
            </button>
          ))}
        </div>
        <input
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          placeholder="app/stream (vd group/1)"
          className="w-40 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={() => setChannel(pending)}
          className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-white"
        >
          Phát
        </button>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>

      {/* Khung xem to gần bằng viewport. Trang /camera bỏ giới hạn max-w-7xl
          (xem app-shell) nên khung dùng hết bề ngang; object-contain giữ nguyên
          tỉ lệ mosaic, không méo/cắt. Overlay phủ khung để click mở UI box, nên
          <video> bỏ `controls` (overlay che thanh controls → xung đột click);
          luồng mosaic live autoplay/muted không cần play/pause. */}
      <div className="relative h-[calc(100dvh-12rem)] min-h-[24rem] w-full overflow-hidden rounded-xl border border-border bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
        {overlayHref ? (
          <a
            href={overlayHref}
            target="_blank"
            rel="noreferrer"
            title="Mở giao diện box"
            className="absolute inset-0 flex cursor-pointer items-center justify-center opacity-0 transition hover:bg-black/40 hover:opacity-100"
          >
            <span className="inline-flex items-center gap-2 rounded-md bg-black/70 px-3 py-2 text-sm font-medium text-white">
              <ExternalLink className="size-4" />
              Mở giao diện box
            </span>
          </a>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Player WebRTC nối thẳng tới AI Box (ZLMediaKit). Box chỉ phát <strong>theo nhóm (mosaic
        9 ô)</strong> qua WebRTC — xem 1 camera riêng cần player h265/WebSocket (chưa hỗ trợ). Chỉ
        chạy khi máy xem cùng LAN với box và dashboard chạy HTTP. Nguồn:{" "}
        <code className="rounded bg-muted px-1">{boxHost ?? "…"}/webrtc?app=group&stream=N</code>. Đổi
        địa chỉ box ở trang <strong>Cài đặt</strong>.
      </p>
    </div>
  );
}
