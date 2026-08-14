"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EzvizVerifyCodeDialog } from "@/components/camera/ezviz-verify-code-dialog";
import { cn } from "@/lib/cn";
import { EzvizPlayError, fetchEzvizPlaySource } from "@/services/ezviz-client";

// Player cho camera EZVIZ. ezuikit-js đụng `window` ngay lúc import nên phải
// import động trong effect — không được import tĩnh ở đầu file, Next sẽ kéo
// nó vào bundle server và vỡ lúc build.
//
// Vòng đời quan trọng: mỗi instance mở một WebSocket tới EZVIZ. Không destroy
// khi unmount thì chuyển tab qua lại vài lần là có cả chục kết nối sống song
// song, camera tụt khung hình mà không rõ vì sao.

interface EzvizPlayerProps {
  code: string;
  kind: "live" | "rec";
  /** Mốc bắt đầu khi xem lại. Đổi giá trị này là dựng lại player từ mốc mới. */
  begin?: Date;
  className?: string;
  /** Gọi sau khi người dùng nhập mã xác minh, để trang tải lại danh sách. */
  onVerifyCodeSaved?: () => void;
}

type State =
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; message: string; needsVerifyCode: boolean };

/** Số khung hình tối đa chờ khung chứa có kích thước thật trước khi bỏ cuộc. */
const MAX_MEASURE_FRAMES = 10;

/** Các nhịp chờ (ms) giữa những lần thử nạp khoá giải mã. */
const SECRET_KEY_RETRY_MS = [1500, 2000, 3000];

/** Chỉ những phương thức dashboard thật sự gọi — không mô tả cả API thư viện. */
interface EzvizPlayerHandle {
  stop?: () => void;
  destroy?: () => void;
  /** Nạp khoá giải mã sau khi player báo thiết bị mã hoá. */
  setSecretKey?: (code: string) => unknown;
}

/**
 * Đo khung chứa, chờ qua vài khung hình nếu trình duyệt chưa bố cục xong.
 * Trả kích thước dự phòng khi hết hạn chờ — thà player nhỏ còn hơn không phát.
 */
async function measureContainer(containerId: string): Promise<{ width: number; height: number }> {
  for (let frame = 0; frame < MAX_MEASURE_FRAMES; frame += 1) {
    const rect = document.getElementById(containerId)?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
  return { width: 640, height: 360 };
}

export function EzvizPlayer({ code, kind, begin, className, onVerifyCodeSaved }: EzvizPlayerProps) {
  // id ổn định giữa các lần render; EZUIKit nhận id của thẻ chứa, không nhận ref.
  const containerId = `ezviz-${useId().replace(/:/g, "")}-${code}-${kind}`;
  const [state, setState] = useState<State>({ phase: "loading" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const playerRef = useRef<EzvizPlayerHandle | null>(null);
  // Khoá phụ thuộc dạng chuỗi: `begin` là Date mới mỗi lần render cha, dùng
  // thẳng làm dependency sẽ dựng lại player liên tục.
  const beginKey = begin ? begin.toISOString() : "";

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setState({ phase: "loading" });
      let source;
      try {
        source = await fetchEzvizPlaySource(code, kind, beginKey ? new Date(beginKey) : undefined);
      } catch (e) {
        if (cancelled) return;
        setState({
          phase: "error",
          message: e instanceof Error ? e.message : "Không phát được camera EZVIZ",
          needsVerifyCode: e instanceof EzvizPlayError && e.needsVerifyCode
        });
        return;
      }

      let EZUIKitPlayer;
      try {
        ({ EZUIKitPlayer } = await import("ezuikit-js"));
      } catch {
        if (cancelled) return;
        setState({ phase: "error", message: "Không tải được thư viện phát EZVIZ", needsVerifyCode: false });
        return;
      }
      // Đã unmount trong lúc chờ import/fetch → đừng khởi tạo player mồ côi.
      if (cancelled) return;

      // Thư viện cần số pixel thật, không nhận undefined để tự co. Khung có
      // thể chưa được bố cục xong ngay sau khi fetch xong (grid + aspect-video)
      // — đo lúc đó ra 0 và player dựng canvas sai kích thước. Chờ tối đa vài
      // khung hình cho tới khi đo ra số dương.
      const box = await measureContainer(containerId);
      if (cancelled) return;

      try {
        playerRef.current = new EZUIKitPlayer({
          id: containerId,
          accessToken: source.accessToken,
          url: source.url,
          // Tài liệu bảo truyền mã xác minh qua đây; thực tế bản 9.0.17 KHÔNG
          // nối nó vào bộ giải mã (xem khối setSecretKey bên dưới). Vẫn truyền
          // để phòng bản sau sửa lại đúng như tài liệu.
          validCode: source.validCode,
          // Mặc định của thư viện là open.ys7.com (Trung Quốc) — tài khoản dự
          // án ở region US, không đặt lại thì player gọi nhầm máy chủ.
          env: { domain: source.envDomain },
          width: box.width,
          height: box.height,
          scaleMode: 1,
          template: kind === "live" ? "pcLive" : "pcRec"
        });

        if (cancelled) return;
        setState({ phase: "ready" });

        // Nạp khoá giải mã cho camera bật mã hoá. Phải làm theo nhịp chứ không
        // theo sự kiện, vì máy trạng thái của thư viện (đã đọc mã nguồn 9.0.17):
        //   1. Tuỳ chọn `validCode` lúc khởi tạo KHÔNG được nối vào bộ giải mã.
        //   2. Bộ giải mã trả nErrorCode 5 → player phát sự kiện
        //      "validateCodeError" RỒI MỚI đặt cờ _encryptedStopped và stop().
        //      Nghe sự kiện rồi gọi ngay là quá sớm: setSecretKey chỉ ẩn thông
        //      báo rồi không làm gì, để lại màn đen (đã thử, hỏng).
        //   3. setSecretKey chỉ có tác dụng khi player đã ở trạng thái chờ khoá.
        // Nên gọi lặp vài nhịp: nhịp sớm là no-op vô hại, nhịp trúng thì phát.
        if (source.validCode) {
          for (const delay of SECRET_KEY_RETRY_MS) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
            if (cancelled || !playerRef.current) return;
            playerRef.current.setSecretKey?.(source.validCode);
          }
        }
      } catch {
        if (!cancelled) {
          setState({ phase: "error", message: "Không khởi tạo được player EZVIZ", needsVerifyCode: false });
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      const player = playerRef.current;
      playerRef.current = null;
      try {
        player?.stop?.();
        player?.destroy?.();
      } catch {
        // Player chưa khởi tạo xong thì destroy có thể ném — không có gì để làm thêm.
      }
    };
    // beginKey chứ không phải begin: Date mới mỗi render sẽ dựng lại player liên tục.
  }, [code, kind, beginKey, containerId]);

  return (
    <div className={cn("relative size-full bg-black", className)}>
      <div id={containerId} className="size-full" />

      {state.phase !== "ready" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          {state.phase === "loading" ? (
            <p className="text-xs text-muted-foreground">Đang kết nối EZVIZ…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{state.message}</p>
              {state.needsVerifyCode ? (
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white"
                >
                  Nhập mã xác minh
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {dialogOpen ? (
        <EzvizVerifyCodeDialog
          code={code}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            onVerifyCodeSaved?.();
          }}
        />
      ) : null}
    </div>
  );
}
