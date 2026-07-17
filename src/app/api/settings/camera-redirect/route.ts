import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { AppSettingModel } from "@/models/app-setting";
import { SETTING_KEY_CAMERA_REDIRECT_URL, normalizeRedirectUrl } from "@/lib/aibox/box-settings";

export const runtime = "nodejs";

// Khác box-host: cho phép chuỗi rỗng để người dùng xoá cấu hình, trang Camera
// quay về dùng host box như trước.
const bodySchema = z.object({ cameraRedirectUrl: z.string() });

export async function GET() {
  await connectMongo();
  const doc = await AppSettingModel.findOne({
    key: SETTING_KEY_CAMERA_REDIRECT_URL
  }).lean<{ value: string } | null>();
  return NextResponse.json({ ok: true, cameraRedirectUrl: doc?.value ?? null });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  // Rỗng = xoá cấu hình, không lưu doc rỗng để GET trả null rõ ràng.
  if (!parsed.data.cameraRedirectUrl.trim()) {
    await connectMongo();
    await AppSettingModel.deleteOne({ key: SETTING_KEY_CAMERA_REDIRECT_URL });
    return NextResponse.json({ ok: true, cameraRedirectUrl: null });
  }

  const cameraRedirectUrl = normalizeRedirectUrl(parsed.data.cameraRedirectUrl);
  if (!cameraRedirectUrl) {
    return NextResponse.json(
      { ok: false, error: "Link không hợp lệ (ví dụ: http://192.168.1.26/#/preview/video)" },
      { status: 400 }
    );
  }

  await connectMongo();
  await AppSettingModel.updateOne(
    { key: SETTING_KEY_CAMERA_REDIRECT_URL },
    { $set: { value: cameraRedirectUrl } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, cameraRedirectUrl });
}
