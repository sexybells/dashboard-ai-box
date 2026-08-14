// Fetcher phía client cho các API EZVIZ. Mỏng + typed, theo mẫu camera-client.ts.

/** Lỗi mang thông điệp tiếng Việt từ API để hiển thị thẳng trên giao diện. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export interface EzvizSyncResult {
  added: number;
  updated: number;
  missing: number;
}

export async function syncEzviz(): Promise<EzvizSyncResult> {
  const response = await fetch("/api/ezviz/sync", { method: "POST" });
  if (!response.ok) {
    throw new Error(await readError(response, "Không đồng bộ được camera EZVIZ"));
  }
  const data = (await response.json()) as { ok: boolean } & EzvizSyncResult;
  return { added: data.added, updated: data.updated, missing: data.missing };
}

export async function addEzvizDevice(input: {
  deviceSerial: string;
  validateCode: string;
}): Promise<void> {
  const response = await fetch("/api/ezviz/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Không thêm được camera EZVIZ"));
  }
}

export async function saveVerifyCode(code: string, verifyCode: string): Promise<void> {
  const response = await fetch(
    `/api/ezviz/cameras/${encodeURIComponent(code)}/verify-code`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verifyCode })
    }
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Không lưu được mã xác minh"));
  }
}

export interface EzvizPlaySource {
  url: string;
  accessToken: string;
  /** Mã xác minh — EZUIKit nhận qua tuỳ chọn validCode, không qua URL. */
  validCode: string;
  /** Domain region để player gọi đúng máy chủ EZVIZ (mặc định thư viện là CN). */
  envDomain: string;
}

/** Lỗi phát luồng có cờ riêng cho trường hợp thiếu mã xác minh. */
export class EzvizPlayError extends Error {
  constructor(
    message: string,
    readonly needsVerifyCode: boolean
  ) {
    super(message);
    this.name = "EzvizPlayError";
  }
}

export async function fetchEzvizPlaySource(
  code: string,
  kind: "live" | "rec",
  /** Mốc bắt đầu khi xem lại; bỏ trống thì player không tự phát. */
  begin?: Date
): Promise<EzvizPlaySource> {
  const query = new URLSearchParams({ kind });
  if (begin) query.set("begin", begin.toISOString());
  const response = await fetch(
    `/api/ezviz/cameras/${encodeURIComponent(code)}/play?${query.toString()}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    let message = "Không phát được camera EZVIZ";
    let needsVerifyCode = false;
    try {
      const data = (await response.json()) as { error?: string; needsVerifyCode?: boolean };
      message = data.error ?? message;
      needsVerifyCode = data.needsVerifyCode === true;
    } catch {
      // giữ thông điệp mặc định
    }
    throw new EzvizPlayError(message, needsVerifyCode);
  }
  const data = (await response.json()) as { ok: boolean } & EzvizPlaySource;
  return {
    url: data.url,
    accessToken: data.accessToken,
    validCode: data.validCode,
    envDomain: data.envDomain
  };
}

export type PtzDirection = 0 | 1 | 2 | 3 | 8 | 9;

export async function sendPtz(
  code: string,
  body: { direction: PtzDirection; speed?: 0 | 1 | 2; action: "start" | "stop" },
  options?: { keepalive?: boolean }
): Promise<void> {
  await fetch(`/api/ezviz/cameras/${encodeURIComponent(code)}/ptz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: options?.keepalive
  });
}

export interface EzvizPlaybackRange {
  start: string;
  end: string;
}

export async function fetchEzvizPlaybackRanges(
  code: string,
  params: { from: Date; to: Date }
): Promise<EzvizPlaybackRange[]> {
  const query = new URLSearchParams({
    from: params.from.toISOString(),
    to: params.to.toISOString()
  });
  const response = await fetch(
    `/api/ezviz/cameras/${encodeURIComponent(code)}/playback?${query.toString()}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(await readError(response, "Không tải được danh sách video"));
  }
  const data = (await response.json()) as { ok: boolean; ranges: EzvizPlaybackRange[] };
  return data.ranges;
}
