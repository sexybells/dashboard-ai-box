"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
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

/**
 * Thời gian xoay tối thiểu cho một cú bấm (ms). Bấm nhanh chỉ dài ~3ms nên
 * thiếu mốc này thì camera đứng yên. 400ms cho ra một nhịp xoay thấy rõ mà
 * không quá đà.
 */
const PTZ_MIN_MOVE_MS = 400;

const ZOOMS: { direction: PtzDirection; label: string; Icon: typeof Plus }[] = [
  { direction: 8, label: "Phóng to", Icon: Plus },
  { direction: 9, label: "Thu nhỏ", Icon: Minus }
];

interface PtzPadProps {
  code: string;
  /** Bản gọn để đặt đè lên ô camera trong lưới (ô nhỏ, nền là video). */
  compact?: boolean;
}

export function PtzPad({ code, compact = false }: PtzPadProps) {
  const holding = useRef<PtzDirection | null>(null);
  /** Thời điểm gửi lệnh start, để biết đã xoay đủ lâu chưa. */
  const startedAt = useRef(0);
  const stopTimer = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendStop = useCallback(
    (direction: PtzDirection, options?: { keepalive?: boolean }) => {
      void sendPtz(code, { direction, action: "stop" }, options);
    },
    [code]
  );

  /**
   * Nhả tay. Một cú bấm bình thường chỉ dài vài mili-giây — gửi stop ngay thì
   * camera nhận start/stop gần như cùng lúc và đứng yên, người dùng tưởng nút
   * hỏng. Nên giữ lệnh chạy đủ PTZ_MIN_MOVE_MS rồi mới dừng; giữ lâu hơn thì
   * dừng ngay khi nhả. `immediate` dành cho unmount/ẩn tab: lúc đó an toàn
   * quan trọng hơn, dừng luôn.
   */
  const stop = useCallback(
    (options?: { keepalive?: boolean; immediate?: boolean }) => {
      const direction = holding.current;
      if (direction === null) return;
      holding.current = null;

      if (stopTimer.current !== null) {
        window.clearTimeout(stopTimer.current);
        stopTimer.current = null;
      }

      const elapsed = Date.now() - startedAt.current;
      const remaining = PTZ_MIN_MOVE_MS - elapsed;
      if (options?.immediate || remaining <= 0) {
        sendStop(direction, options);
        return;
      }
      stopTimer.current = window.setTimeout(() => {
        stopTimer.current = null;
        sendStop(direction);
      }, remaining);
    },
    [sendStop]
  );

  const start = useCallback(
    (direction: PtzDirection) => {
      // Đang giữ hướng khác mà bấm hướng mới: dừng hướng cũ ngay, không chờ.
      if (holding.current !== null) stop({ immediate: true });
      // Còn lệnh dừng đang hẹn giờ từ cú bấm trước thì huỷ, kẻo nó dừng nhầm
      // lượt xoay mới.
      if (stopTimer.current !== null) {
        window.clearTimeout(stopTimer.current);
        stopTimer.current = null;
      }

      holding.current = direction;
      startedAt.current = Date.now();
      setError(null);
      void sendPtz(code, { direction, speed: 1, action: "start" }).catch(() => {
        holding.current = null;
        setError("Không gửi được lệnh điều khiển");
      });
    },
    [code, stop]
  );

  // Unmount (đổi camera, rời tab, đóng trang) vẫn phải dừng. keepalive để
  // request kịp bay đi khi trang đang bị gỡ; immediate vì không còn component
  // nào sống để chạy hẹn giờ.
  useEffect(() => {
    return () => stop({ keepalive: true, immediate: true });
  }, [stop]);

  // Tab bị ẩn / cửa sổ mất focus trong lúc đang giữ → coi như nhả tay.
  useEffect(() => {
    const onHide = () => stop({ keepalive: true, immediate: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onHide);
    };
  }, [stop]);

  // Bản gọn nằm đè lên video nên cần nền tối và nút nhỏ hơn; bản thường nằm
  // trong thẻ riêng dưới khung hình.
  const buttonClass = compact
    ? "flex size-7 items-center justify-center rounded-md bg-black/60 text-white transition hover:bg-black/80 active:bg-brand"
    : "flex size-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted active:bg-brand active:text-white";
  const iconClass = compact ? "size-3.5" : "size-4";

  function holdProps(direction: PtzDirection) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        // Ô camera trong lưới có thể nằm trong vùng bấm khác — đừng để lệnh
        // xoay kéo theo hành vi của phần tử cha.
        e.stopPropagation();
        start(direction);
      },
      onPointerUp: () => stop(),
      onPointerLeave: () => stop(),
      onPointerCancel: () => stop()
    };
  }

  return (
    <div className={cn("flex items-center", compact ? "flex-col gap-1" : "flex-wrap gap-4")}>
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
            <Icon className={iconClass} />
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
            <Icon className={iconClass} />
          </button>
        ))}
      </div>

      {error ? (
        <p className={cn("text-destructive", compact ? "text-[10px]" : "text-xs")}>{error}</p>
      ) : null}
    </div>
  );

}
