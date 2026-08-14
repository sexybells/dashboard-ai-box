// Đồng bộ thiết bị EZVIZ vào collection `cameras`. Dùng chung cho nút bấm
// thủ công lẫn cron, nên nằm ở lib chứ không trong route handler.

import { nextCameraCode } from "@/lib/aibox/cameras";
import { postEzviz } from "@/lib/aibox/ezviz-api";
import { mergeDeviceList, type EzvizChannel, type EzvizDevice } from "@/lib/aibox/ezviz-devices";
import { withTokenRetry } from "@/lib/aibox/ezviz-token";
import { connectMongo } from "@/lib/mongodb";
import { CameraModel } from "@/models/camera";

export interface EzvizSyncResult {
  added: number;
  updated: number;
  missing: number;
}

/** Một doc `cameras` ứng với một kênh của một thiết bị. */
function channelKey(serial: string, channel: number): string {
  return `${serial}:${channel}`;
}

export async function syncEzvizDevices(): Promise<EzvizSyncResult> {
  const remote = await withTokenRetry(async ({ token, domain }) => {
    const devices = await postEzviz<EzvizDevice[] | null>(domain, "/api/lapp/device/list", {
      accessToken: token,
      pageStart: 0,
      pageSize: 200
    });
    // camera/list trả data rỗng (không phải mảng) khi tài khoản chưa có kênh nào.
    const channels = await postEzviz<EzvizChannel[] | null>(domain, "/api/lapp/camera/list", {
      accessToken: token,
      pageStart: 0,
      pageSize: 200
    });
    return mergeDeviceList(devices ?? [], channels ?? []);
  });

  await connectMongo();
  const existing = await CameraModel.find({ source: "ezviz" }).lean<
    { code: string; ezvizSerial?: string; ezvizChannel?: number }[]
  >();
  const codeByChannel = new Map(
    existing.map((d) => [channelKey(d.ezvizSerial ?? "", d.ezvizChannel ?? 1), d.code])
  );

  // Mã camNN dùng chung không gian với camera RTSP để không đụng path MediaMTX.
  // Nạp một lần rồi tự cộng dồn — hỏi lại Mongo trong vòng lặp là N+1 query.
  const usedCodes = (await CameraModel.find({}, { code: 1 }).lean<{ code: string }[]>()).map(
    (d) => d.code
  );

  let added = 0;
  let updated = 0;
  const seen = new Set<string>();

  for (const camera of remote) {
    const key = channelKey(camera.serial, camera.channel);
    seen.add(key);

    const code = codeByChannel.get(key);
    if (code) {
      await CameraModel.updateOne(
        { code },
        {
          $set: {
            name: camera.name,
            ezvizOnline: camera.online,
            ezvizEncrypted: camera.encrypted,
            ezvizMissing: false
          }
        }
      );
      updated += 1;
      continue;
    }

    const newCode = nextCameraCode(usedCodes);
    try {
      await CameraModel.create({
        code: newCode,
        name: camera.name,
        source: "ezviz",
        ezvizSerial: camera.serial,
        ezvizChannel: camera.channel,
        ezvizOnline: camera.online,
        ezvizEncrypted: camera.encrypted
      });
      usedCodes.push(newCode);
      added += 1;
    } catch (e) {
      // Hai lần đồng bộ chạy song song có thể chọn trùng code; unique index
      // chặn lại. Bỏ qua để lần sau nhặt tiếp, đừng làm hỏng cả đợt đồng bộ.
      if (e && typeof e === "object" && "code" in e && (e as { code: number }).code === 11000) {
        continue;
      }
      throw e;
    }
  }

  // Thiết bị biến mất khỏi tài khoản: KHÔNG xoá doc — một lần API lỗi không
  // được phép cuốn đi cấu hình người dùng. Chỉ hạ trạng thái.
  const missingCodes = existing
    .filter((d) => !seen.has(channelKey(d.ezvizSerial ?? "", d.ezvizChannel ?? 1)))
    .map((d) => d.code);
  if (missingCodes.length > 0) {
    await CameraModel.updateMany(
      { code: { $in: missingCodes } },
      { $set: { ezvizOnline: false, ezvizMissing: true } }
    );
  }

  return { added, updated, missing: missingCodes.length };
}
