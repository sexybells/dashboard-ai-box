// Tra doc camera EZVIZ theo mã camNN. Bốn route (play, ptz, playback,
// verify-code) đều cần đúng phép kiểm này nên gom về một chỗ.

import { isValidCameraCode } from "@/lib/aibox/cameras";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";

export interface EzvizCameraDoc {
  code: string;
  name: string;
  ezvizSerial: string;
  ezvizChannel: number;
  ezvizVerifyCode?: string;
  ezvizEncrypted?: boolean;
}

export type EzvizLookup =
  | { ok: true; camera: EzvizCameraDoc }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function findEzvizCamera(code: string): Promise<EzvizLookup> {
  if (!isValidCameraCode(code)) {
    return { ok: false, status: 400, error: "Mã camera không hợp lệ" };
  }

  await connectMongo();
  const doc = await CameraModel.findOne(
    { code },
    { code: 1, name: 1, source: 1, ezvizSerial: 1, ezvizChannel: 1, ezvizVerifyCode: 1, ezvizEncrypted: 1 }
  ).lean<{
    code: string;
    name: string;
    source?: "rtsp" | "ezviz";
    ezvizSerial?: string;
    ezvizChannel?: number;
    ezvizVerifyCode?: string;
    ezvizEncrypted?: boolean;
  } | null>();

  if (!doc) {
    return { ok: false, status: 404, error: "Camera không tồn tại" };
  }
  if (doc.source !== "ezviz" || !doc.ezvizSerial) {
    return { ok: false, status: 409, error: "Camera này không phải camera EZVIZ" };
  }

  return {
    ok: true,
    camera: {
      code: doc.code,
      name: doc.name,
      ezvizSerial: doc.ezvizSerial,
      ezvizChannel: doc.ezvizChannel ?? 1,
      ezvizVerifyCode: doc.ezvizVerifyCode,
      ezvizEncrypted: doc.ezvizEncrypted
    }
  };
}
