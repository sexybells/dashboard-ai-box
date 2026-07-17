"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { FALLBACK_BOX_HOST } from "@/lib/aibox/box-settings";

// Nhúng thẳng giao diện box thay vì tự dựng player WebRTC. Lý do: ZLMediaKit
// trên box chỉ quảng bá ICE candidate là IP LAN (192.168.1.26:58002), nên
// signaling qua reverse proxy thì chạy còn media thì không tới được từ ngoài
// LAN. Giao diện box tự phát video qua `wss://<host>/video/` — đi chung cổng
// HTTPS với trang nên xuyên proxy được, xem từ mạng nào cũng chạy.

// Chrome của giao diện box nằm trong document khác origin nên CSS bên này
// không với tới để `display:none` — same-origin policy. Cách duy nhất từ phía
// dashboard là đẩy iframe lệch đúng kích thước phần chrome rồi để
// `overflow-hidden` của khung ngoài cắt đi. Cả hai phần chrome đều
// position:fixed ở mép, còn vùng nội dung đã chừa sẵn chỗ cho chúng
// (`.main-container{margin-left:210px}`, `.app-main{padding-top:50px}`), nên
// đẩy lệch xong là nội dung về sát mép, không hụt gì.
//
// Hai số này bám theo CSS của box; box đổi giao diện là phải chỉnh lại:
//   .sidebar-container{position:fixed;left:0;width:210px}
//   .navbar{height:50px} trong .fixed-header{position:fixed;top:0}
const BOX_SIDEBAR_WIDTH = 210;
const BOX_NAVBAR_HEIGHT = 50;

/** Trang cha HTTPS mà nhúng iframe HTTP thì trình duyệt chặn (mixed content). */
function isMixedContent(src: string): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:" && src.startsWith("http://");
}

export function CameraEmbed() {
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Link redirect riêng thắng; không cấu hình thì nhúng gốc host box.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [host, redirect] = await Promise.all([
        fetch("/api/settings/box-host")
          .then((r) => r.json())
          .then((d: { boxHost?: string }) => d.boxHost || FALLBACK_BOX_HOST)
          .catch(() => FALLBACK_BOX_HOST),
        fetch("/api/settings/camera-redirect")
          .then((r) => r.json())
          .then((d: { cameraRedirectUrl?: string | null }) => d.cameraRedirectUrl ?? null)
          .catch(() => null)
      ]);
      if (!cancelled) setSrc(redirect ?? host);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const blocked = src !== null && isMixedContent(src);

  return (
    <div className="space-y-4">
      {/* Trang /camera bỏ giới hạn max-w-7xl (xem app-shell) nên khung dùng hết
          bề ngang. Giao diện box mất vài giây khởi động rồi mới vẽ — lớp phủ
          dưới đây chỉ che tới lúc iframe tải xong tài liệu. */}
      <div className="relative h-[calc(100dvh-8rem)] min-h-[24rem] w-full overflow-hidden rounded-xl border border-border bg-black">
        {blocked ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-destructive">Không nhúng được giao diện box</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Dashboard đang chạy HTTPS nhưng địa chỉ box là HTTP (<code className="rounded bg-muted px-1">{src}</code>),
              nên trình duyệt chặn vì mixed content. Đổi box sang HTTPS ở trang <strong>Cài đặt</strong>.
            </p>
            <a
              href={src ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ExternalLink className="size-4" />
              Mở tab mới
            </a>
          </div>
        ) : src ? (
          <>
            <iframe
              src={src}
              title="Giao diện AI Box"
              style={{
                width: `calc(100% + ${BOX_SIDEBAR_WIDTH}px)`,
                marginLeft: `-${BOX_SIDEBAR_WIDTH}px`,
                height: `calc(100% + ${BOX_NAVBAR_HEIGHT}px)`,
                marginTop: `-${BOX_NAVBAR_HEIGHT}px`
              }}
              onLoad={() => setLoaded(true)}
              allow="autoplay; fullscreen"
              className="border-0"
            />
            {loaded ? null : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
                <p className="text-sm text-muted-foreground">Đang tải giao diện box…</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Đang tải cấu hình…</p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Khung trên nhúng giao diện AI Box và cắt bỏ sidebar của box, cần đăng nhập vào box lần đầu.
        Đổi địa chỉ box hoặc link nhúng ở trang <strong>Cài đặt</strong>.
      </p>
    </div>
  );
}
