import { findEzvizCamera } from "@/lib/aibox/ezviz-camera-lookup";
import { CameraModel } from "@/models/camera";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  verifyCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,16}$/, "Mã xác minh chỉ gồm chữ và số, 4–16 ký tự")
});

/**
 * PUT /api/ezviz/cameras/[code]/verify-code — lưu mã xác minh in trên tem.
 * device/list không trả mã này nên đây là bước bắt buộc nhập tay cho mọi
 * camera bật mã hoá.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  const found = await findEzvizCamera(code);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: found.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" },
      { status: 400 }
    );
  }

  await CameraModel.updateOne({ code }, { $set: { ezvizVerifyCode: parsed.data.verifyCode } });
  return NextResponse.json({ ok: true });
}
