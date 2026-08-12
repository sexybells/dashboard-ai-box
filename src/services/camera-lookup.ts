// Kiểm tra camera tồn tại (server-side) — allowlist động thay cho mảng cố
// định trước đây, dùng chung cho các route live/recordings/playback trước khi
// proxy tới MediaMTX (chặn SSRF tới path tuỳ ý).

import { isValidCameraCode } from "@/lib/aibox/cameras";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";

export async function cameraExists(code: string): Promise<boolean> {
  if (!isValidCameraCode(code)) return false;
  await connectMongo();
  return (await CameraModel.exists({ code })) !== null;
}
