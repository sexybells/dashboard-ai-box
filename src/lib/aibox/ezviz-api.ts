// Client HTTP tới EZVIZ Open Platform. Mọi lệnh là POST form-urlencoded và
// LUÔN trả HTTP 200 — lỗi nằm trong trường `code` của thân JSON, nên không
// được tin `response.ok`. Gọi sai endpoint thì EZVIZ trả HTML Tomcat, không
// phải JSON (đã gặp thật khi dò API).

/** Lỗi mang mã EZVIZ để tầng trên quyết định retry / báo người dùng. */
export class EzvizError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "EzvizError";
  }
}

/**
 * Domain theo region. Một appKey chỉ sống ở đúng một region; gọi nhầm region
 * trả 10017. Tài khoản của dự án nằm ở US (iusopen) — để đầu danh sách.
 */
export const EZVIZ_AREA_DOMAINS = [
  "https://iusopen.ezvizlife.com",
  "https://isgpopen.ezvizlife.com",
  "https://ieuopen.ezvizlife.com",
  "https://iindiaopen.ezvizlife.com",
  "https://open.ys7.com"
] as const;

export interface EzvizBody {
  code: string;
  msg: string;
  data: unknown;
  page?: unknown;
}

export function parseEzvizBody(raw: string): EzvizBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EzvizError("INVALID_RESPONSE", "EZVIZ trả về dữ liệu không đọc được");
  }
  if (!parsed || typeof parsed !== "object" || !("code" in parsed)) {
    throw new EzvizError("INVALID_RESPONSE", "EZVIZ trả về dữ liệu không đọc được");
  }
  const body = parsed as { code: unknown; msg?: unknown; data?: unknown; page?: unknown };
  return {
    code: String(body.code),
    msg: typeof body.msg === "string" ? body.msg : "",
    data: body.data ?? null,
    page: body.page
  };
}

/** POST form-urlencoded, ném EzvizError khi code khác "200". */
export async function postEzviz<T>(
  domain: string,
  path: string,
  params: Record<string, string | number>
): Promise<T> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) form.set(key, String(value));

  const response = await fetch(`${domain}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });

  const body = parseEzvizBody(await response.text());
  if (body.code !== "200") throw new EzvizError(body.code, body.msg);
  return body.data as T;
}

/** Thông điệp tiếng Việt theo mã lỗi EZVIZ (bảng trong spec). */
export function ezvizErrorMessage(code: string): string {
  switch (code) {
    case "NOT_CONFIGURED":
      return "Chưa cấu hình EZVIZ trong Cài đặt";
    case "NO_SUBACCOUNT":
      return "Chưa chọn nguồn token phát — vào Cài đặt bật 'Dùng token tài khoản chính'";
    case "10002":
      return "Phiên EZVIZ hết hạn, thử lại sau giây lát";
    case "10001":
    case "10017":
      return "Cấu hình EZVIZ sai, kiểm tra lại trong Cài đặt";
    case "60019":
      return "Camera bật mã hoá — cần nhập mã xác minh";
    case "20002":
      return "Thiết bị không còn trong tài khoản EZVIZ";
    case "20014":
    case "20018":
      return "Thiết bị không thuộc tài khoản này";
    case "INVALID_RESPONSE":
      return "EZVIZ trả về dữ liệu không đọc được";
    default:
      return "Không kết nối được EZVIZ";
  }
}
