// Cấu hình host AI Box. Thuần + không I/O để unit-test được và dùng chung
// cho cả API route (server) lẫn trang Camera (client).

/** Khoá của doc trong collection `settings` giữ host AI Box. */
export const SETTING_KEY_BOX_HOST = "boxHost";

/** Host mặc định cuối cùng khi DB lẫn env đều không có (box trên LAN chùa). */
export const FALLBACK_BOX_HOST = "http://192.168.1.26";

/**
 * Chuẩn hoá host người dùng nhập về dạng origin chuẩn, hoặc null nếu không thể
 * dùng làm host http(s). Chấp nhận host trần ("192.168.1.26:8080") bằng cách
 * mặc định http, và cắt bỏ path/dấu / thừa.
 */
export function normalizeBoxHost(input: string): string | null {
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
    return url.origin;
  } catch {
    return null;
  }
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
