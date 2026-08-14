"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendPtz, type PtzDirection } from "@/services/ezviz-client";

// Điều khiển PTZ. Quy tắc sống còn: MỌI đường thoát khỏi trạng thái "đang giữ"
// đều phải gửi stop — nhả chuột, con trỏ rời nút, chuột bị huỷ (kéo ra ngoài
// cửa sổ), component unmount. Thiếu một nhánh là camera quay mãi cho tới khi
// chạm giới hạn cơ khí.

const DIRECTIONS: { direction: PtzDirection; label: string; Icon: typeof ChevronUp; cell: string }[] =
  [
    { direction: 0, label: "Lên", Icon: ChevronUp, cell: "col-start-2 row-start-1" },
    { direction: 2, label: "Trái", Icon: ChevronLeft, cell: "col-start-1 row-start-2" },
    { direction: 3, label: "Phải", Icon: ChevronRight, cell: "col-start-3 row-start-2" },
    { direction: 1, label: "Xuống", Icon: ChevronDown, cell: "col-start-2 row-start-3" }
  ];

const ZOOMS: { direction: PtzDirection; label: string; Icon: typeof Plus }[] = [
  { direction: 8, label: "Phóng to", Icon: Plus },
  { direction: 9, label: "Thu nhỏ", Icon: Minus }
];

export function PtzPad({ code }: { code: string }) {
  const holding = useRef<PtzDirection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(
    (options?: { keepalive?: boolean }) => {
      const direction = holding.current;
      if (direction === null) return;
      holding.current = null;
      void sendPtz(code, { direction, action: "stop" }, options);
    },
    [code]
  );

  const start = useCallback(
    (direction: PtzDirection) => {
      // Đang giữ hướng khác mà bấm hướng mới: dừng hướng cũ trước.
      if (holding.current !== null) stop();
      holding.current = direction;
      setError(null);
      void sendPtz(code, { direction, speed: 1, action: "start" }).catch(() => {
        holding.current = null;
        setError("Không gửi được lệnh điều khiển");
      });
    },
    [code, stop]
  );

  // Unmount (đổi camera, rời tab, đóng trang) vẫn phải dừng. keepalive để
  // request kịp bay đi khi trang đang bị gỡ.
  useEffect(() => {
    return () => stop({ keepalive: true });
  }, [stop]);

  // Tab bị ẩn / cửa sổ mất focus trong lúc đang giữ → coi như nhả tay.
  useEffect(() => {
    const onHide = () => stop({ keepalive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onHide);
    };
  }, [stop]);

  const buttonClass =
    "flex size-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted active:bg-brand active:text-white";

  function holdProps(direction: PtzDirection) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        start(direction);
      },
      onPointerUp: () => stop(),
      onPointerLeave: () => stop(),
      onPointerCancel: () => stop()
    };
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        {DIRECTIONS.map(({ direction, label, Icon, cell }) => (
          <button
            key={direction}
            type="button"
            title={label}
            aria-label={label}
            className={`${buttonClass} ${cell}`}
            {...holdProps(direction)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        {ZOOMS.map(({ direction, label, Icon }) => (
          <button
            key={direction}
            type="button"
            title={label}
            aria-label={label}
            className={buttonClass}
            {...holdProps(direction)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
