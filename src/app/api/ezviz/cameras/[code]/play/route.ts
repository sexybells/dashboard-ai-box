// Cấp URL ezopen + token cho player chạy trong trình duyệt. Đây là chỗ duy
// nhất token EZVIZ rời server, nên bắt buộc dùng token tài khoản con.

import { EzvizError, ezvizErrorMessage } from "@/lib/aibox/ezviz-api";
import { findEzvizCamera } from "@/lib/aibox/ezviz-camera-lookup";
import { buildEzopenUrl } from "@/lib/aibox/ezviz-devices";
import { getPlayToken } from "@/lib/aibox/ezviz-token";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET /api/ezviz/cameras/[code]/play?kind=live|rec */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  const found = await findEzvizCamera(code);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: found.status });
  }
  const camera = found.camera;

  const kindParam = request.nextUrl.searchParams.get("kind") ?? "live";
  if (kindParam !== "live" && kindParam !== "rec") {
    return NextResponse.json({ ok: false, error: "Loại luồng không hợp lệ" }, { status: 400 });
  }

  // Camera bật mã hoá mà thiếu mã xác minh thì EZVIZ trả 60019; chặn sớm ở
  // đây để giao diện hiện đúng nút "Nhập mã xác minh".
  if (camera.ezvizEncrypted && !camera.ezvizVerifyCode) {
    return NextResponse.json(
      { ok: false, error: ezvizErrorMessage("60019"), needsVerifyCode: true },
      { status: 409 }
    );
  }

  let auth;
  try {
    auth = await getPlayToken();
  } catch (e) {
    if (e instanceof EzvizError) {
      const status = e.code === "NO_SUBACCOUNT" || e.code === "NOT_CONFIGURED" ? 409 : 502;
      return NextResponse.json({ ok: false, error: ezvizErrorMessage(e.code) }, { status });
    }
    throw e;
  }

  // Mốc bắt đầu khi xem lại; thiếu thì player mở ra nhưng không tự phát.
  const beginParam = request.nextUrl.searchParams.get("begin");
  const begin = beginParam ? new Date(beginParam) : null;
  if (beginParam && (!begin || Number.isNaN(begin.getTime()))) {
    return NextResponse.json({ ok: false, error: "Mốc thời gian không hợp lệ" }, { status: 400 });
  }

  const url = buildEzopenUrl({
    serial: camera.ezvizSerial,
    channel: camera.ezvizChannel,
    kind: kindParam,
    hd: true,
    // Xem lại lấy từ cloud EZVIZ — thẻ nhớ (.rec) của camera dự án đang rỗng.
    cloud: kindParam === "rec",
    begin: begin ?? undefined
  });

  return NextResponse.json(
    {
      ok: true,
      url,
      accessToken: auth.token,
      // EZUIKit nhận mã xác minh qua `validCode`, không qua URL.
      validCode: camera.ezvizVerifyCode ?? "",
      // Player phải gọi đúng region, mặc định của thư viện là open.ys7.com (CN).
      envDomain: auth.domain
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
