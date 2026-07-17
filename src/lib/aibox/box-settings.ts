// Cấu hình AI Box. Thuần + không I/O để unit-test được và dùng chung
// cho cả API route (server) lẫn trang Camera (client).

/** Khoá của doc trong collection `settings` giữ host AI Box. */
export const SETTING_KEY_BOX_HOST = "boxHost";

/** Khoá của doc giữ link mở khi bấm vào khung camera trực tiếp. */
export const SETTING_KEY_CAMERA_REDIRECT_URL = "cameraRedirectUrl";

/** Host mặc định cuối cùng khi DB lẫn env đều không có (box trên LAN chùa). */
export const FALLBACK_BOX_HOST = "http://192.168.1.26";

/**
 * Parse chuỗi người dùng nhập thành URL http(s), hoặc null nếu không dùng được.
 * Chấp nhận host trần ("192.168.1.26:8080") bằng cách mặc định scheme http.
 */
function parseHttpUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Có "://" thì scheme phải là http/https; không có thì coi là host trần.
  // "javascript:alert(1)" không có "://" nên rơi xuống nhánh host trần và bị
  // new URL() loại vì port không hợp lệ.
  const sep = trimmed.indexOf("://");
  if (sep > -1 && !/^https?$/i.test(trimmed.slice(0, sep))) return null;
  const withScheme = sep > -1 ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Chuẩn hoá host người dùng nhập về dạng origin chuẩn, hoặc null nếu không thể
 * dùng làm host http(s). Cắt bỏ path/dấu / thừa.
 */
export function normalizeBoxHost(input: string): string | null {
  return parseHttpUrl(input)?.origin ?? null;
}

/**
 * Chuẩn hoá link redirect. Khác normalizeBoxHost ở chỗ giữ nguyên
 * path/query/hash để trỏ được vào deep link của box, vd
 * "http://192.168.1.26/#/preview/video". Link trần không path/query/hash thì
 * trả origin cho gọn, tránh dấu "/" thừa hiện lại trong ô nhập.
 */
export function normalizeRedirectUrl(input: string): string | null {
  const url = parseHttpUrl(input);
  if (!url) return null;
  const bare = url.pathname === "/" && !url.search && !url.hash;
  return bare ? url.origin : url.href;
}

/**
 * Host mặc định khi DB chưa có bản ghi. AIBOX_HOST là mặc định phía server;
 * NEXT_PUBLIC_AIBOX_HOST giữ lại để không phá deploy cũ đang set biến này.
 */
export function resolveDefaultBoxHost(env: {
  AIBOX_HOST?: string;
  NEXT_PUBLIC_AIBOX_HOST?: string;
}): string {
  return (
    normalizeBoxHost(env.AIBOX_HOST ?? "") ??
    normalizeBoxHost(env.NEXT_PUBLIC_AIBOX_HOST ?? "") ??
    FALLBACK_BOX_HOST
  );
}
