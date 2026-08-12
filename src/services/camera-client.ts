// Fetcher phía client cho các API camera. Mỏng + typed, theo mẫu
// footfall-client.ts. Không parse Date ở đây — recording-timeline.ts lo.

import type { RecordingRangeInput } from "@/lib/aibox/recording-timeline";

export interface CameraListItem {
  code: string;
  name: string;
  location: string;
  online: boolean;
  /** RTSP nguồn — chỉ dùng để đổ vào form sửa. */
  rtspUrl?: string;
}

export async function fetchCameras(): Promise<CameraListItem[]> {
  const response = await fetch("/api/cameras", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load cameras: ${response.status}`);
  }
  const data = (await response.json()) as { ok: boolean; cameras: CameraListItem[] };
  return data.cameras;
}

export interface CameraInput {
  name: string;
  rtspUrl: string;
  location?: string;
}

/** Lỗi mang thông điệp tiếng Việt từ API để hiển thị thẳng trên form. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createCamera(input: CameraInput): Promise<CameraListItem> {
  const response = await fetch("/api/cameras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Không thêm được camera"));
  }
  const data = (await response.json()) as { camera: CameraListItem };
  return data.camera;
}

export async function updateCamera(code: string, input: CameraInput): Promise<void> {
  const response = await fetch(`/api/cameras/${encodeURIComponent(code)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Không cập nhật được camera"));
  }
}

export async function deleteCamera(code: string): Promise<void> {
  const response = await fetch(`/api/cameras/${encodeURIComponent(code)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readError(response, "Không xoá được camera"));
  }
}

export interface CameraLiveUrls {
  hls: string;
  webrtc: string;
  /** Creds đọc luồng MediaMTX (Basic) — null khi môi trường không bật auth. */
  auth: { user: string; pass: string } | null;
}

export async function fetchCameraLiveUrls(code: string): Promise<CameraLiveUrls> {
  const response = await fetch(`/api/cameras/${encodeURIComponent(code)}/live`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Failed to load live urls: ${response.status}`);
  }
  const data = (await response.json()) as { ok: boolean } & CameraLiveUrls;
  return { hls: data.hls, webrtc: data.webrtc, auth: data.auth ?? null };
}

/** Các khoảng đã ghi trong [from, to] — đầu vào cho recording-timeline. */
export async function fetchRecordingRanges(
  code: string,
  params: { from: Date; to: Date }
): Promise<RecordingRangeInput[]> {
  const query = new URLSearchParams({
    from: params.from.toISOString(),
    to: params.to.toISOString()
  });
  const response = await fetch(
    `/api/cameras/${encodeURIComponent(code)}/recordings?${query.toString()}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`Failed to load recordings: ${response.status}`);
  }
  const data = (await response.json()) as { ok: boolean; ranges: RecordingRangeInput[] };
  return data.ranges;
}

/** URL stream tua lại qua proxy Next (đưa thẳng vào <video src>). */
export function buildPlaybackStreamUrl(
  code: string,
  params: { start: Date; durationSec: number }
): string {
  const query = new URLSearchParams({
    start: params.start.toISOString(),
    duration: String(params.durationSec)
  });
  return `/api/cameras/${encodeURIComponent(code)}/playback?${query.toString()}`;
}
