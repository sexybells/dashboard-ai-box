// Client server-side thao tác path MediaMTX qua Control API v3 (loopback).
// Mongo là nguồn sự thật; path trong MediaMTX là dẫn xuất: CRUD đẩy thay đổi
// ngay, còn reconcileCameraPaths tự chữa khi MediaMTX restart (API config
// không bền qua restart — path add lúc chạy sẽ mất, phải đẩy lại).
//
// Đã xác minh thực nghiệm trên v1.20.0:
//   POST   /v3/config/paths/add/{name}      (path kế thừa pathDefaults → tự ghi hình)
//   POST   /v3/config/paths/replace/{name}
//   DELETE /v3/config/paths/delete/{name}
//   GET    /v3/config/paths/get/{name}      (404 nếu không có)
//   GET    /v3/config/paths/list

import { buildTranscodeCommand } from "@/lib/aibox/cameras";
import { mediamtxApiUrl } from "@/lib/aibox/media-endpoints";

/** Encoder theo môi trường: Linux libx264 (mặc định), dev macOS videotoolbox. */
function transcodeEncoder(): string {
  return process.env.MEDIA_TRANSCODE_ENCODER || "libx264";
}

/** Cấu hình path cho một camera: pipeline transcode đẩy vào chính path đó. */
function cameraPathConfig(rtspUrl: string): Record<string, unknown> {
  return {
    runOnInit: buildTranscodeCommand(rtspUrl, transcodeEncoder()),
    runOnInitRestart: true
  };
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${mediamtxApiUrl()}${path}`, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {})
  });
}

/**
 * Đảm bảo path của camera tồn tại đúng cấu hình: có rồi thì replace (đổi RTSP
 * là pipeline cũ bị dừng, pipeline mới khởi động), chưa có thì add.
 * Ném Error khi MediaMTX từ chối — caller quyết định rollback.
 */
export async function ensureCameraPath(code: string, rtspUrl: string): Promise<void> {
  const config = cameraPathConfig(rtspUrl);
  const existing = await api("GET", `/v3/config/paths/get/${code}`);
  const res = existing.ok
    ? await api("POST", `/v3/config/paths/replace/${code}`, config)
    : await api("POST", `/v3/config/paths/add/${code}`, config);
  if (!res.ok) {
    throw new Error(`MediaMTX từ chối cấu hình path ${code}: ${res.status}`);
  }
}

/** Xoá path (idempotent — 404 coi như đã xoá). */
export async function deleteCameraPath(code: string): Promise<void> {
  const res = await api("DELETE", `/v3/config/paths/delete/${code}`);
  if (!res.ok && res.status !== 404) {
    throw new Error(`MediaMTX từ chối xoá path ${code}: ${res.status}`);
  }
}

/** Tên các path đang cấu hình trong MediaMTX. */
export async function listConfiguredPathNames(): Promise<string[]> {
  const res = await api("GET", "/v3/config/paths/list");
  if (!res.ok) throw new Error(`MediaMTX không trả danh sách path: ${res.status}`);
  const data = (await res.json()) as { items?: { name: string }[] };
  return (data.items ?? []).map((i) => i.name);
}

/**
 * Đồng bộ MediaMTX theo Mongo: thêm path còn thiếu (sau khi MediaMTX
 * restart), sửa path lệch cấu hình (đổi RTSP lúc MediaMTX không chạy), xoá
 * path camNN thừa (doc đã bị xoá lúc MediaMTX không chạy). So sánh runOnInit
 * trước khi replace — replace là restart pipeline (giật stream) nên chỉ làm
 * khi thật sự lệch. Chỉ đụng path dạng camNN — không xoá path cấu hình tay.
 * Lỗi từng path không chặn các path còn lại.
 */
export async function reconcileCameraPaths(
  cameras: { code: string; rtspUrl: string }[]
): Promise<{ added: number; replaced: number; removed: number }> {
  const existing = new Set(await listConfiguredPathNames());
  let added = 0;
  let replaced = 0;
  let removed = 0;

  for (const cam of cameras) {
    try {
      if (!existing.has(cam.code)) {
        await ensureCameraPath(cam.code, cam.rtspUrl);
        added++;
        continue;
      }
      // Có path rồi: chỉ replace khi lệnh transcode thật sự lệch.
      const res = await api("GET", `/v3/config/paths/get/${cam.code}`);
      if (!res.ok) continue;
      const current = (await res.json()) as { runOnInit?: string };
      const wanted = cameraPathConfig(cam.rtspUrl) as { runOnInit: string };
      if (current.runOnInit !== wanted.runOnInit) {
        await ensureCameraPath(cam.code, cam.rtspUrl);
        replaced++;
      }
    } catch {
      // MediaMTX đang khởi động dở — lần reconcile sau sẽ vá tiếp.
    }
  }

  const wanted = new Set(cameras.map((c) => c.code));
  for (const name of existing) {
    if (/^cam\d{2,}$/.test(name) && !wanted.has(name)) {
      try {
        await deleteCameraPath(name);
        removed++;
      } catch {
        // như trên
      }
    }
  }

  return { added, replaced, removed };
}
