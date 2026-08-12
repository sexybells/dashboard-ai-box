import { buildPlaybackListUrl, mediamtxPlaybackUrl } from "@/lib/aibox/media-endpoints";
import { cameraExists } from "@/services/camera-lookup";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Parse ISO date từ query, undefined nếu thiếu/hỏng. */
function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * GET /api/cameras/[code]/recordings?from=&to= — các khoảng đã ghi hình,
 * proxy MediaMTX /list (bind 127.0.0.1). Chỉ trả {start, duration}: trình
 * duyệt không bao giờ gọi thẳng MediaMTX, muốn phát thì dựng URL qua proxy
 * /api/cameras/[code]/playback từ chính hai giá trị này (không cần rewrite
 * trường `url` của MediaMTX).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  if (!(await cameraExists(code))) {
    return NextResponse.json({ ok: false, error: "Camera không tồn tại" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const url = buildPlaybackListUrl(mediamtxPlaybackUrl(), {
    path: code,
    start: parseDateParam(searchParams.get("from")),
    end: parseDateParam(searchParams.get("to"))
  });

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    // MediaMTX trả 404 "no recording segments found" khi khoảng thời gian
    // không có ghi hình — đó là ngày trống bình thường, không phải lỗi.
    if (res.status === 404) {
      return NextResponse.json({ ok: true, ranges: [] });
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `MediaMTX trả lỗi ${res.status}` },
        { status: 502 }
      );
    }
    const items = (await res.json()) as Array<{ start: string; duration: number }>;
    const ranges = items.map(({ start, duration }) => ({ start, duration }));
    return NextResponse.json({ ok: true, ranges });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Không kết nối được máy chủ ghi hình" },
      { status: 502 }
    );
  }
}
