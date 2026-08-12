// Logic thuần cho CRUD camera (không I/O, unit-test được): sinh mã camera,
// validate RTSP URL và dựng lệnh transcode. Danh sách camera nằm trong Mongo
// (src/models/camera.ts) — file này không còn giữ mảng CAMERAS cố định.

export interface CameraConfig {
  code: string;
  name: string;
  location?: string;
}

/** Mã camera do server sinh: "cam" + 2+ chữ số, cũng là tên path MediaMTX. */
const CODE_PATTERN = /^cam\d{2,}$/;

export function isValidCameraCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/**
 * Sinh mã kế tiếp từ các mã đang có: cam01, cam02… Lấy max+1 (không lấp lỗ
 * hổng đã xoá — tránh camera mới thừa kế nhầm lịch sử ghi hình trên đĩa của
 * camera cũ trùng tên path).
 */
export function nextCameraCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const m = code.match(/^cam(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `cam${String(max + 1).padStart(2, "0")}`;
}

/**
 * Validate + chuẩn hoá RTSP URL người dùng nhập.
 *
 * URL này sẽ được nhúng vào lệnh ffmpeg do MediaMTX chạy qua shell
 * (runOnInit) nên validate CHẶT để chống command injection:
 * - phải parse được bằng new URL(), scheme rtsp/rtsps, có hostname;
 * - cấm ký tự nguy hiểm với shell — nháy đơn (ta bọc URL bằng nháy đơn),
 *   nháy kép, backslash, backtick, $, khoảng trắng và ký tự điều khiển.
 * Trả về URL đã chuẩn hoá (url.href), hoặc null nếu không dùng được.
 */
export function normalizeRtspUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Ký tự shell nguy hiểm hoặc không bao giờ xuất hiện trong RTSP URL hợp lệ.
  if (/['"\\`$\s\x00-\x1f\x7f]/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") return null;
  if (!url.hostname) return null;
  return url.href;
}

/**
 * Lệnh ffmpeg transcode nguồn RTSP → H.264 720p15 đẩy ngược vào path MediaMTX
 * (mọi camera đều xem được trên trình duyệt, kể cả nguồn HEVC; bitrate ghi
 * hình đồng nhất ~1.2Mbps). URL đã qua normalizeRtspUrl và được bọc nháy đơn
 * — không còn ký tự nào thoát được chuỗi nháy đơn trong shell.
 *
 * `encoder` theo môi trường: server Linux dùng libx264, dev macOS dùng
 * videotoolbox (đọc từ env MEDIA_TRANSCODE_ENCODER, mặc định libx264).
 */
export function buildTranscodeCommand(rtspUrl: string, encoder: string = "libx264"): string {
  const videoArgs =
    encoder === "h264_videotoolbox"
      ? "-c:v h264_videotoolbox -realtime 1 -b:v 2500k"
      : "-c:v libx264 -preset veryfast -tune zerolatency -b:v 1200k -maxrate 1500k -bufsize 2400k";
  return (
    "ffmpeg -nostdin -loglevel warning -rtsp_transport tcp -timeout 15000000 " +
    `-i '${rtspUrl}' ` +
    `${videoArgs} -vf scale=1280:-2 -r 15 -g 30 -pix_fmt yuv420p -an ` +
    "-f rtsp -rtsp_transport tcp rtsp://localhost:$RTSP_PORT/$MTX_PATH"
  );
}
