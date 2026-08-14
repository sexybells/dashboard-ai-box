// Các khoảng có video xem lại trên EZVIZ. Nguồn mặc định là cloud (recType=2)
// — thẻ nhớ (recType=1) của camera dự án đang rỗng.

import { EzvizError, ezvizErrorMessage, postEzviz } from "@/lib/aibox/ezviz-api";
import { findEzvizCamera } from "@/lib/aibox/ezviz-camera-lookup";
import { clipsToRanges, dateToMs, type EzvizClip } from "@/lib/aibox/ezviz-devices";
import { withTokenRetry } from "@/lib/aibox/ezviz-token";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Khoảng tra cứu tối đa một lần gọi — chặn client hỏi cả năm. */
const MAX_RANGE_MS = 7 * 86_400_000;

/** GET /api/ezviz/cameras/[code]/playback?from=<ISO>&to=<ISO> */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  const found = await findEzvizCamera(code);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: found.status });
  }
  const camera = found.camera;

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;

  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ ok: false, error: "Khoảng thời gian không hợp lệ" }, { status: 400 });
  }
  if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return NextResponse.json(
      { ok: false, error: "Khoảng thời gian phải hợp lệ và không quá 7 ngày" },
      { status: 400 }
    );
  }

  let clips: EzvizClip[];
  try {
    clips = await withTokenRetry(async ({ token, domain }) => {
      // Tham số thời gian là epoch MILLISECONDS — chuỗi "yyyy-MM-dd HH:mm:ss"
      // như tài liệu ghi bị EZVIZ trả 10001 (đã kiểm chứng).
      const data = await postEzviz<EzvizClip[] | null>(domain, "/api/lapp/video/by/time", {
        accessToken: token,
        deviceSerial: camera.ezvizSerial,
        channelNo: camera.ezvizChannel,
        startTime: dateToMs(from),
        endTime: dateToMs(to),
        recType: 2
      });
      return data ?? [];
    });
  } catch (e) {
    if (e instanceof EzvizError) {
      return NextResponse.json({ ok: false, error: ezvizErrorMessage(e.code) }, { status: 502 });
    }
    throw e;
  }

  const ranges = clipsToRanges(clips).map((r) => ({
    start: r.start.toISOString(),
    end: r.end.toISOString()
  }));

  return NextResponse.json({ ok: true, ranges }, { headers: { "Cache-Control": "no-store" } });
}
