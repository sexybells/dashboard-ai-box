import { isKnownCameraCode } from "@/lib/aibox/cameras";
import {
  buildHlsLiveUrl,
  buildWhepUrl,
  mediaViewerAuth,
  publicHlsBase,
  publicWebrtcBase
} from "@/lib/aibox/media-endpoints";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/cameras/[code]/live — URL phát trực tiếp + creds đọc luồng.
 * Media plane đi thẳng từ trình duyệt tới MediaMTX (không qua proxy Next) nên
 * trả URL công khai dựng từ NEXT_PUBLIC_MEDIA_*. MediaMTX production bật auth
 * đọc (authInternalUsers) — creds chỉ phát qua endpoint này (đã cookie-auth),
 * người chưa đăng nhập dashboard không lấy được nên không xem trộm được camera.
 */
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  if (!isKnownCameraCode(code)) {
    return NextResponse.json({ ok: false, error: "Camera không tồn tại" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    hls: buildHlsLiveUrl(publicHlsBase(), code),
    webrtc: buildWhepUrl(publicWebrtcBase(), code),
    auth: mediaViewerAuth()
  });
}
