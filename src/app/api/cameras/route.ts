import { nextCameraCode, normalizeRtspUrl } from "@/lib/aibox/cameras";
import { mediamtxApiUrl } from "@/lib/aibox/media-endpoints";
import { deleteCameraPath, ensureCameraPath } from "@/lib/aibox/mediamtx-paths";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

// Trạng thái path từ control API MediaMTX. `ready` = nguồn đang stream được.
interface MediamtxPathItem {
  name: string;
  ready: boolean;
}

async function fetchReadyByName(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try {
    const res = await fetch(`${mediamtxApiUrl()}/v3/paths/list`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: MediamtxPathItem[] };
      for (const item of data.items ?? []) {
        map.set(item.name, item.ready === true);
      }
    }
  } catch {
    // MediaMTX không phản hồi → mọi camera hiện offline.
  }
  return map;
}

/**
 * GET /api/cameras — danh sách camera từ Mongo kèm trạng thái online. Đọc
 * thuần, không đụng cấu hình MediaMTX: việc đồng bộ path (kể cả tự chữa sau
 * khi MediaMTX restart) do cron POST /api/webhooks/cameras-sync đảm nhiệm, nên
 * trang này gọi liên tục (poll 30s, nhiều tab) cũng không sinh ghi cấu hình.
 * `rtspUrl` trả kèm cho form sửa (dashboard 1 admin, cookie-auth + HTTPS).
 */
export async function GET() {
  await connectMongo();
  const docs = await CameraModel.find({}, { code: 1, name: 1, location: 1, rtspUrl: 1 })
    .sort({ code: 1 })
    .lean<{ code: string; name: string; location?: string; rtspUrl: string }[]>();

  const readyByName = await fetchReadyByName();
  const cameras = docs.map((d) => ({
    code: d.code,
    name: d.name,
    location: d.location ?? "",
    rtspUrl: d.rtspUrl,
    online: readyByName.get(d.code) ?? false
  }));

  return NextResponse.json({ ok: true, cameras });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên camera").max(80),
  rtspUrl: z.string().trim().min(1, "Thiếu link RTSP").max(2048, "Link RTSP quá dài"),
  location: z.string().trim().max(120).optional()
});

/**
 * POST /api/cameras — thêm camera: sinh mã camNN, lưu Mongo rồi đẩy path vào
 * MediaMTX. MediaMTX từ chối thì rollback doc để hai bên không lệch nhau.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" },
      { status: 400 }
    );
  }

  const rtspUrl = normalizeRtspUrl(parsed.data.rtspUrl);
  if (!rtspUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Link RTSP không hợp lệ (dạng rtsp://user:pass@ip:port/duong-dan, không chứa khoảng trắng hay ký tự đặc biệt)"
      },
      { status: 400 }
    );
  }

  await connectMongo();
  const codes = (await CameraModel.find({}, { code: 1 }).lean<{ code: string }[]>()).map(
    (d) => d.code
  );
  const code = nextCameraCode(codes);

  let doc;
  try {
    doc = await CameraModel.create({
      code,
      name: parsed.data.name,
      location: parsed.data.location,
      rtspUrl
    });
  } catch (e) {
    // Hai POST đồng thời có thể chọn trùng code (read-modify-write không khoá).
    // Unique index chặn ghi trùng → báo lỗi sạch để người dùng bấm lại thay vì 500.
    if (e && typeof e === "object" && "code" in e && (e as { code: number }).code === 11000) {
      return NextResponse.json(
        { ok: false, error: "Có thao tác thêm camera khác vừa chạy, vui lòng thử lại" },
        { status: 409 }
      );
    }
    throw e;
  }

  try {
    await ensureCameraPath(code, rtspUrl);
  } catch {
    // Không để Mongo giữ camera mà MediaMTX không nhận — xoá cả hai phía.
    await CameraModel.deleteOne({ _id: doc._id });
    await deleteCameraPath(code).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: "Máy chủ media không nhận cấu hình camera, thử lại sau" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    camera: { code, name: doc.name, location: doc.location ?? "", rtspUrl, online: false }
  });
}
