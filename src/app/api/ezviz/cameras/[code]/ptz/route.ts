// Proxy lệnh PTZ. Đi qua server để token EZVIZ chính không rời máy chủ và để
// client không cần biết serial thiết bị.

import { EzvizError, ezvizErrorMessage, postEzviz } from "@/lib/aibox/ezviz-api";
import { findEzvizCamera } from "@/lib/aibox/ezviz-camera-lookup";
import { withTokenRetry } from "@/lib/aibox/ezviz-token";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

/** Hướng theo quy ước EZVIZ: 0 lên, 1 xuống, 2 trái, 3 phải, 8 zoom in, 9 zoom out. */
const bodySchema = z.object({
  direction: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(8),
    z.literal(9)
  ]),
  speed: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
  action: z.enum(["start", "stop"])
});

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  const found = await findEzvizCamera(code);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: found.status });
  }
  const camera = found.camera;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Lệnh PTZ không hợp lệ" }, { status: 400 });
  }

  const { direction, speed, action } = parsed.data;

  try {
    await withTokenRetry(({ token, domain }) =>
      postEzviz(
        domain,
        action === "start" ? "/api/lapp/device/ptz/start" : "/api/lapp/device/ptz/stop",
        {
          accessToken: token,
          deviceSerial: camera.ezvizSerial,
          channelNo: camera.ezvizChannel,
          direction,
          // Lệnh stop không nhận speed; gửi thừa tham số EZVIZ trả 10001.
          ...(action === "start" ? { speed } : {})
        }
      )
    );
  } catch (e) {
    if (e instanceof EzvizError) {
      return NextResponse.json({ ok: false, error: ezvizErrorMessage(e.code) }, { status: 502 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
