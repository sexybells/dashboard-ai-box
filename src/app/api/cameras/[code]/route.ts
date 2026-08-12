import { isValidCameraCode, normalizeRtspUrl } from "@/lib/aibox/cameras";
import { deleteCameraPath, ensureCameraPath } from "@/lib/aibox/mediamtx-paths";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên camera").max(80),
  rtspUrl: z.string().trim().min(1, "Thiếu link RTSP").max(2048, "Link RTSP quá dài"),
  location: z.string().trim().max(120).optional()
});

/**
 * PUT /api/cameras/[code] — sửa tên/vị trí/RTSP. Đổi RTSP thì replace path
 * MediaMTX (pipeline transcode khởi động lại với nguồn mới); MediaMTX từ chối
 * thì hoàn nguyên doc để hai bên không lệch.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  if (!isValidCameraCode(code)) {
    return NextResponse.json({ ok: false, error: "Camera không tồn tại" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
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
  const before = await CameraModel.findOne({ code }).lean<{
    name: string;
    location?: string;
    rtspUrl: string;
  } | null>();
  if (!before) {
    return NextResponse.json({ ok: false, error: "Camera không tồn tại" }, { status: 404 });
  }

  await CameraModel.updateOne(
    { code },
    { $set: { name: parsed.data.name, location: parsed.data.location ?? "", rtspUrl } }
  );

  if (rtspUrl !== before.rtspUrl) {
    try {
      await ensureCameraPath(code, rtspUrl);
    } catch {
      await CameraModel.updateOne(
        { code },
        { $set: { name: before.name, location: before.location ?? "", rtspUrl: before.rtspUrl } }
      );
      return NextResponse.json(
        { ok: false, error: "Máy chủ media không nhận link mới, đã giữ nguyên cấu hình cũ" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    camera: { code, name: parsed.data.name, location: parsed.data.location ?? "", rtspUrl }
  });
}

/**
 * DELETE /api/cameras/[code] — gỡ camera khỏi MediaMTX rồi xoá doc. Ghi hình
 * cũ trên đĩa để retention tự dọn (không xoá file — lỡ tay xoá camera vẫn còn
 * xem lại được tới hết chu kỳ lưu).
 */
export async function DELETE(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  if (!isValidCameraCode(code)) {
    return NextResponse.json({ ok: false, error: "Camera không tồn tại" }, { status: 404 });
  }

  await connectMongo();
  const doc = await CameraModel.findOne({ code }).lean();
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Camera không tồn tại" }, { status: 404 });
  }

  // Gỡ MediaMTX trước: nếu media server sập thì camera vẫn còn trong danh
  // sách, người dùng thử lại — tránh doc mất mà pipeline còn chạy mãi.
  try {
    await deleteCameraPath(code);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Máy chủ media không phản hồi, thử lại sau" },
      { status: 502 }
    );
  }
  await CameraModel.deleteOne({ code });

  return NextResponse.json({ ok: true });
}
