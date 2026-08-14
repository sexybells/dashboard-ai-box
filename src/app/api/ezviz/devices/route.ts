// Thêm thiết bị vào tài khoản EZVIZ bằng serial + mã xác minh, rồi đồng bộ
// ngay để camera xuất hiện trong lưới mà không cần bấm thêm nút.

import { EzvizError, ezvizErrorMessage, postEzviz } from "@/lib/aibox/ezviz-api";
import { syncEzvizDevices } from "@/lib/aibox/ezviz-sync";
import { withTokenRetry } from "@/lib/aibox/ezviz-token";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  deviceSerial: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6,32}$/, "Serial chỉ gồm chữ và số, 6–32 ký tự"),
  validateCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,16}$/, "Mã xác minh chỉ gồm chữ và số, 4–16 ký tự")
});

export async function POST(request: NextRequest) {
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

  const { deviceSerial, validateCode } = parsed.data;

  try {
    await withTokenRetry(({ token, domain }) =>
      postEzviz(domain, "/api/lapp/device/add", {
        accessToken: token,
        deviceSerial,
        validateCode
      })
    );
  } catch (e) {
    if (e instanceof EzvizError) {
      // 20017 = thiết bị đã thuộc tài khoản này → coi như thành công, đi tiếp
      // để lưu mã xác minh; người dùng không cần biết chi tiết này.
      if (e.code !== "20017") {
        return NextResponse.json({ ok: false, error: ezvizErrorMessage(e.code) }, { status: 502 });
      }
    } else {
      throw e;
    }
  }

  await syncEzvizDevices();

  // Mã xác minh vừa nhập cũng chính là mã để phát luồng — lưu luôn để người
  // dùng không phải nhập lần thứ hai.
  await connectMongo();
  await CameraModel.updateMany(
    { source: "ezviz", ezvizSerial: deviceSerial },
    { $set: { ezvizVerifyCode: validateCode } }
  );

  return NextResponse.json({ ok: true });
}
