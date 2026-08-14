import { EzvizError, ezvizErrorMessage } from "@/lib/aibox/ezviz-api";
import { syncEzvizDevices } from "@/lib/aibox/ezviz-sync";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST /api/ezviz/sync — nạp danh sách thiết bị EZVIZ vào collection `cameras`. */
export async function POST() {
  try {
    const result = await syncEzvizDevices();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof EzvizError) {
      // NOT_CONFIGURED là trạng thái bình thường (chưa nhập key), không phải lỗi hệ thống.
      const status = e.code === "NOT_CONFIGURED" ? 409 : 502;
      return NextResponse.json(
        { ok: false, error: ezvizErrorMessage(e.code) },
        { status }
      );
    }
    throw e;
  }
}
