import { buildPlaybackGetUrl, mediamtxPlaybackUrl } from "@/lib/aibox/media-endpoints";
import { cameraExists } from "@/services/camera-lookup";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/cameras/[code]/playback?start=&duration=&format= — stream video đã
 * ghi. Proxy MediaMTX /get (bind 127.0.0.1): /get nối các segment trong cửa sổ
 * yêu cầu thành một stream fMP4 liên tục, `<video>` phát thẳng được.
 *
 * Forward header Range hai chiều để `<video>` seek trong cửa sổ; đổi mốc thời
 * gian thì client gọi lại với start mới (cách seek chính của UI tua lại).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  if (!(await cameraExists(code))) {
    return NextResponse.json({ ok: false, error: "Camera không tồn tại" }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;

  const start = new Date(searchParams.get("start") ?? "");
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ ok: false, error: "start không hợp lệ" }, { status: 400 });
  }

  const duration = Number(searchParams.get("duration"));
  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ ok: false, error: "duration không hợp lệ" }, { status: 400 });
  }

  const formatParam = searchParams.get("format");
  const format = formatParam === "mp4" ? "mp4" : formatParam === "fmp4" ? "fmp4" : undefined;
  if (formatParam && !format) {
    return NextResponse.json({ ok: false, error: "format không hợp lệ" }, { status: 400 });
  }

  const url = buildPlaybackGetUrl(mediamtxPlaybackUrl(), { path: code, start, duration, format });

  // Forward Range của trình duyệt (nếu có) cho seek trong cửa sổ.
  const headers: Record<string, string> = {};
  const range = request.headers.get("range");
  if (range) headers.Range = range;

  let upstream: Response;
  try {
    // Không đặt timeout: đây là stream video dài, đứt giữa chừng là sai.
    upstream = await fetch(url, { headers, cache: "no-store" });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Không kết nối được máy chủ ghi hình" },
      { status: 502 }
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    // 404 của MediaMTX = không có ghi hình tại mốc đó.
    const status = upstream.status === 404 ? 404 : 502;
    return NextResponse.json(
      { ok: false, error: status === 404 ? "Không có ghi hình tại thời điểm này" : `MediaMTX trả lỗi ${upstream.status}` },
      { status }
    );
  }

  // Chuyển tiếp nguyên body stream + các header cần cho <video> seek được.
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "video/mp4");
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
