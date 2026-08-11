import { CAMERAS } from "@/lib/aibox/cameras";
import { mediamtxApiUrl } from "@/lib/aibox/media-endpoints";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Trạng thái path từ control API MediaMTX (:9997, bind 127.0.0.1).
// `ready` = nguồn RTSP đang kết nối và stream đọc được (đã xác minh v1.20.0).
interface MediamtxPathItem {
  name: string;
  ready: boolean;
}

/**
 * GET /api/cameras — danh sách camera cố định kèm trạng thái online.
 * MediaMTX sập thì vẫn trả danh sách với online=false để UI hiện khung lỗi
 * từng camera thay vì vỡ cả trang.
 */
export async function GET() {
  const readyByName = new Map<string, boolean>();
  try {
    const res = await fetch(`${mediamtxApiUrl()}/v3/paths/list`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: MediamtxPathItem[] };
      for (const item of data.items ?? []) {
        readyByName.set(item.name, item.ready === true);
      }
    }
  } catch {
    // MediaMTX không phản hồi → coi mọi camera offline.
  }

  const cameras = CAMERAS.map((cam) => ({
    code: cam.code,
    name: cam.name,
    location: cam.location ?? "",
    online: readyByName.get(cam.code) ?? false
  }));

  return NextResponse.json({ ok: true, cameras });
}
