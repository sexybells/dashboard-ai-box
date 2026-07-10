export type RealtimeStatus = "connecting" | "live" | "offline";

export function formatAlarmDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

export function formatAlarmTime(time?: string, timeText?: string): string {
  if (timeText?.trim()) return timeText;
  return formatAlarmDate(time);
}

export function getRealtimeStatusLabel(status: RealtimeStatus): string {
  if (status === "live") return "Đang trực tuyến";
  if (status === "offline") return "Mất kết nối";
  return "Đang kết nối";
}

export function getAlarmListEmptyMessage(hasActiveFilters: boolean): string {
  if (hasActiveFilters) {
    return "Không có cảnh báo phù hợp với bộ lọc hiện tại.";
  }
  return "Chưa có cảnh báo. Hãy cấu hình AI Box gửi callback về URL bên trên.";
}

export function formatUnknown(value?: string | number | null): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return "-";
}
