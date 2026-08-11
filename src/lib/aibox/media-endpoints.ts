// Dựng URL tới MediaMTX. Thuần + không I/O để unit-test được và dùng chung:
// phía server (proxy 9996/9997) lẫn phía client (URL HLS/WebRTC công khai).
//
// Hai mặt phẳng (xem spec 2026-08-11-camera-management-playback):
// - control plane: Next proxy tới MEDIAMTX_API_URL / MEDIAMTX_PLAYBACK_URL
//   (bind 127.0.0.1, trình duyệt không gọi thẳng).
// - media plane:   trình duyệt tải HLS/WebRTC trực tiếp từ
//   NEXT_PUBLIC_MEDIA_HLS_BASE / NEXT_PUBLIC_MEDIA_WEBRTC_BASE.

/**
 * Mặc định dev: MediaMTX chạy cùng máy với dashboard. Dùng 127.0.0.1 thay vì
 * "localhost": Chrome ưu tiên phân giải localhost → ::1 (IPv6) trong khi
 * MediaMTX dev bind 127.0.0.1 (IPv4) → ERR_CONNECTION_REFUSED.
 */
export const DEFAULT_MEDIAMTX_API_URL = "http://127.0.0.1:9997";
export const DEFAULT_MEDIAMTX_PLAYBACK_URL = "http://127.0.0.1:9996";
export const DEFAULT_MEDIA_HLS_BASE = "http://127.0.0.1:8888";
export const DEFAULT_MEDIA_WEBRTC_BASE = "http://127.0.0.1:8889";

/** Bỏ dấu "/" cuối để ghép path không bị "//". */
function stripTrailingSlash(base: string): string {
  return base.replace(/\/+$/, "");
}

/** URL playlist HLS live của một camera: `<base>/<code>/index.m3u8`. */
export function buildHlsLiveUrl(base: string, code: string): string {
  return `${stripTrailingSlash(base)}/${code}/index.m3u8`;
}

/** URL endpoint WHEP (WebRTC) của một camera: `<base>/<code>/whep`. */
export function buildWhepUrl(base: string, code: string): string {
  return `${stripTrailingSlash(base)}/${code}/whep`;
}

/**
 * Chuỗi RFC3339 MediaMTX yêu cầu cho tham số start/end/start của /list và
 * /get. Date.toISOString() đã đúng dạng (UTC, có mili giây) — chỉ gói lại cho
 * rõ ý định + một chỗ đổi nếu sau này cần đổi format.
 */
export function toRfc3339(date: Date): string {
  return date.toISOString();
}

/** Query cho MediaMTX /list: liệt kê các khoảng đã ghi của một path. */
export function buildPlaybackListUrl(
  playbackBase: string,
  params: { path: string; start?: Date; end?: Date }
): string {
  const query = new URLSearchParams({ path: params.path });
  if (params.start) query.set("start", toRfc3339(params.start));
  if (params.end) query.set("end", toRfc3339(params.end));
  return `${stripTrailingSlash(playbackBase)}/list?${query.toString()}`;
}

/** Query cho MediaMTX /get: stream fMP4 liên tục từ `start` dài `duration` giây. */
export function buildPlaybackGetUrl(
  playbackBase: string,
  params: { path: string; start: Date; duration: number; format?: "fmp4" | "mp4" }
): string {
  const query = new URLSearchParams({
    path: params.path,
    start: toRfc3339(params.start),
    duration: String(params.duration)
  });
  if (params.format) query.set("format", params.format);
  return `${stripTrailingSlash(playbackBase)}/get?${query.toString()}`;
}

/** Base URL API MediaMTX (server-side). */
export function mediamtxApiUrl(): string {
  return stripTrailingSlash(process.env.MEDIAMTX_API_URL || DEFAULT_MEDIAMTX_API_URL);
}

/** Base URL playback server MediaMTX (server-side). */
export function mediamtxPlaybackUrl(): string {
  return stripTrailingSlash(process.env.MEDIAMTX_PLAYBACK_URL || DEFAULT_MEDIAMTX_PLAYBACK_URL);
}

/**
 * Base HLS/WebRTC phía trình duyệt. NEXT_PUBLIC_* được Next inline lúc build
 * nên phải đọc trực tiếp (không destructure động).
 */
export function publicHlsBase(): string {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_MEDIA_HLS_BASE || DEFAULT_MEDIA_HLS_BASE);
}

export function publicWebrtcBase(): string {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_MEDIA_WEBRTC_BASE || DEFAULT_MEDIA_WEBRTC_BASE);
}

export interface MediaViewerAuth {
  user: string;
  pass: string;
}

/**
 * Tài khoản đọc luồng media (authInternalUsers của MediaMTX, action: read).
 * Server-side only — trả cho client qua endpoint /live (đã cookie-auth),
 * KHÔNG dùng NEXT_PUBLIC để khỏi nướng creds vào bundle. Không đặt env
 * (dev không bật auth) thì trả null, player bỏ qua bước gắn creds.
 */
export function mediaViewerAuth(): MediaViewerAuth | null {
  const user = process.env.MEDIA_VIEWER_USER;
  const pass = process.env.MEDIA_VIEWER_PASS;
  if (!user || !pass) return null;
  return { user, pass };
}
