// Hàm thuần biến dữ liệu EZVIZ thành thứ dashboard dùng được. Không I/O để
// test không cần mạng lẫn Mongo.

/**
 * Host cố định trong URL ezopen — KHÁC domain API theo region. Đã xác minh:
 * tài khoản ở region US (iusopen.ezvizlife.com) nhưng live/address/get vẫn
 * trả URL trỏ open.ezviz.com.
 */
const EZOPEN_HOST = "open.ezviz.com";

export interface EzvizDevice {
  deviceSerial: string;
  deviceName: string;
  status: number;
  model?: string;
}

export interface EzvizChannel {
  deviceSerial: string;
  channelNo: number;
  isEncrypt: number;
}

export interface EzvizCameraSync {
  serial: string;
  channel: number;
  name: string;
  online: boolean;
  encrypted: boolean;
}

/**
 * device/list cho tên + trạng thái, camera/list cho kênh + cờ mã hoá.
 * Device không có kênh nào (API lỗi một nửa) vẫn ra kênh 1 để không mất camera.
 */
export function mergeDeviceList(
  devices: EzvizDevice[],
  channels: EzvizChannel[]
): EzvizCameraSync[] {
  const out: EzvizCameraSync[] = [];
  for (const device of devices) {
    const own = channels.filter((c) => c.deviceSerial === device.deviceSerial);
    const list =
      own.length > 0 ? own : [{ deviceSerial: device.deviceSerial, channelNo: 1, isEncrypt: 0 }];
    for (const channel of list) {
      out.push({
        serial: device.deviceSerial,
        channel: channel.channelNo,
        name: device.deviceName,
        online: device.status === 1,
        encrypted: channel.isEncrypt === 1
      });
    }
  }
  return out;
}

/**
 * URL cho player EZUIKit.
 *
 *   live:        ezopen://open.ezviz.com/<serial>/<kênh>[.hd].live
 *   xem lại SD:  ezopen://open.ezviz.com/<serial>/<kênh>.rec
 *   xem lại mây: ezopen://open.ezviz.com/<serial>/<kênh>.cloud.rec
 *
 * Mã xác minh KHÔNG nằm trong URL — EZUIKit nhận nó qua tuỳ chọn `validCode`.
 * (URL do live/address/get trả về có dạng `ezopen://<mã>@host/...`, nhưng
 * nhét dạng đó vào EZUIKit thì bị "ezopen协议格式有误" — đã kiểm chứng.)
 */
export function buildEzopenUrl(options: {
  serial: string;
  channel: number;
  kind: "live" | "rec";
  hd?: boolean;
  /** Xem lại từ cloud EZVIZ thay vì thẻ nhớ trong camera. */
  cloud?: boolean;
  /** Mốc bắt đầu phát khi xem lại. Thiếu thì player không tự phát. */
  begin?: Date;
}): string {
  const suffix =
    options.kind === "live"
      ? `${options.hd ? ".hd" : ""}.live`
      : `${options.cloud ? ".cloud" : ""}.rec`;
  const query =
    options.kind === "rec" && options.begin ? `?begin=${formatEzopenTime(options.begin)}` : "";
  return `ezopen://${EZOPEN_HOST}/${options.serial}/${options.channel}${suffix}${query}`;
}

/**
 * Mốc thời gian trong URL ezopen: yyyyMMddHHmmss, không mang múi giờ nên hiểu
 * theo giờ địa phương của thiết bị. Camera và người xem cùng ở VN nên dùng giờ
 * máy người xem. CHƯA kiểm chứng được trên thiết bị thật: xem lại cloud bị
 * chặn CORS ở máy dev (xem docs/ezviz-integration.md), phải thử lại sau khi
 * tên miền production được thêm vào danh sách miền hợp lệ của EZVIZ.
 */
export function formatEzopenTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** video/by/time dùng epoch ms, không phải chuỗi ngày như tài liệu ghi. */
export function msToDate(ms: number): Date {
  return new Date(ms);
}

export function dateToMs(date: Date): number {
  return date.getTime();
}

export interface EzvizClip {
  startTime: number;
  endTime: number;
}

/** Gộp các clip cloud thành khoảng liền mạch để vẽ "ngày nào xem được". */
export function clipsToRanges(clips: EzvizClip[]): { start: Date; end: Date }[] {
  const sorted = [...clips]
    .filter((c) => Number.isFinite(c.startTime) && c.endTime > c.startTime)
    .sort((a, b) => a.startTime - b.startTime);

  const ranges: { start: Date; end: Date }[] = [];
  for (const clip of sorted) {
    const last = ranges.at(-1);
    // Hai clip cách nhau dưới 1 phút coi như liền mạch — EZVIZ cắt clip theo
    // sự kiện nên khoảng trống nhỏ là bình thường, không phải mất dữ liệu.
    if (last && clip.startTime - last.end.getTime() <= 60_000) {
      if (clip.endTime > last.end.getTime()) last.end = msToDate(clip.endTime);
      continue;
    }
    ranges.push({ start: msToDate(clip.startTime), end: msToDate(clip.endTime) });
  }
  return ranges;
}
