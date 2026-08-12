import { reconcileCameraPaths } from "@/lib/aibox/mediamtx-paths";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/cameras-sync — cron trên server gọi mỗi phút (curl
 * loopback) để đồng bộ path MediaMTX theo Mongo. Cần thiết vì config đẩy qua
 * Control API KHÔNG bền qua restart: thiếu endpoint này thì MediaMTX restart
 * xong sẽ không ghi hình cho tới khi có người mở trang camera.
 *
 * Nằm ngoài cookie-auth (xem auth-guard) nên tự gác bằng token chia sẻ:
 * env CAMERA_SYNC_TOKEN phải khớp header x-sync-token; không đặt env thì
 * endpoint coi như tắt (404).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CAMERA_SYNC_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (request.headers.get("x-sync-token") !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  const cameras = await CameraModel.find({}, { code: 1, rtspUrl: 1 }).lean<
    { code: string; rtspUrl: string }[]
  >();

  try {
    const result = await reconcileCameraPaths(cameras);
    return NextResponse.json({ ok: true, ...result, cameras: cameras.length });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Không kết nối được máy chủ media" },
      { status: 502 }
    );
  }
}
