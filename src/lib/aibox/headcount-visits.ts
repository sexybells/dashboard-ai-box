// Chuyển sự kiện đếm người (HeadCount) của AI Box thành "lượt khách" rồi đóng
// gói lại đúng hình dạng payload FaceIdCount để đẩy sang hệ thống khác.
//
// Vì sao phải đổi dạng: box chỉ còn gửi HeadCount (mỗi người qua vạch một sự
// kiện, kèm hướng In/Out), trong khi bên nhận đọc theo FaceIdCount — một
// heartbeat mang số LŨY KẾ của cả ngày. Bên nhận gom theo (ngày, camera, khung
// giờ) rồi lấy `$max`, KHÔNG cộng các nhịp; nên số gửi đi phải là tổng dồn từ
// đầu ngày, gửi lại nguyên vẹn ở mỗi nhịp.

/** Số lượt In/Out đã đếm được của một camera trong ngày. */
export interface CameraTally {
  camera: string;
  in: number;
  out: number;
}

export interface FaceIdCountWindow {
  Start: number;
  End: number;
  Count: number;
}

/** Khung giờ phủ trọn ngày: 00h00 → 23h59. */
export const FULL_DAY_WINDOW = { Start: 0, End: 23 } as const;

/**
 * Một lượt khách = một In ghép với một Out.
 *
 * Ghép trong phạm vi từng camera rồi mới cộng lại, chứ không cộng gộp In/Out của
 * mọi camera trước khi ghép: mỗi camera là một vạch riêng, gộp trước sẽ cho phép
 * một In ở cổng này ghép nhầm với một Out ở cổng khác.
 *
 * Phần lẻ bị bỏ là có chủ đích: In nhiều hơn Out nghĩa là khách còn ở bên trong,
 * chưa thành một lượt trọn vẹn.
 */
export function countVisitPairs(tallies: CameraTally[]): number {
  return tallies.reduce((total, tally) => total + Math.min(tally.in, tally.out), 0);
}

/**
 * Dựng payload FaceIdCount từ một payload HeadCount thật của cùng box.
 *
 * Lấy bản thật làm nền thay vì tự dựng từ đầu, vì box gửi kèm hàng chục trường
 * bao ngoài (`Media.Params`, `SensorData`, `GPS`, `alarm_voice_text`…) mà bên
 * nhận có thể trông vào; tự liệt kê tay thì thiếu là chuyện sớm muộn.
 */
export function buildFaceIdCountPayload(
  template: Record<string, unknown>,
  fields: {
    count: number;
    timeText: string;
    timestamp: number;
    alarmId: string;
    uniqueId: string;
    window?: { Start: number; End: number };
  }
): Record<string, unknown> {
  const window = fields.window ?? FULL_DAY_WINDOW;
  const payload: Record<string, unknown> = { ...template };

  // FaceIdCount không kèm ảnh — bỏ hẳn ảnh và đường dẫn ảnh thừa hưởng từ HeadCount.
  delete payload.ImageData;
  payload.LocalRawPath = "";
  payload.LocalLabeledPath = "";

  payload.AlarmId = fields.alarmId;
  payload.UniqueId = fields.uniqueId;
  payload.Summary = "FaceIdCount";
  payload.Time = fields.timeText;
  payload.TimeStamp = fields.timestamp;
  payload.Result = {
    AISInfo: null,
    Cropped: false,
    Description: "Count By Face Id",
    ExtraObjects: [],
    FaceIdCount: true,
    Properties: [
      {
        desc: "Count By Face Id",
        display: `${String(window.Start).padStart(2, "0")}-${window.End}：${fields.count}`,
        property: "FaceIdCount",
        type: "json",
        value: [{ Count: fields.count, End: window.End, Start: window.Start }] satisfies FaceIdCountWindow[]
      }
    ],
    RegType: "Scene",
    Regions: [],
    RelativeRegion: null,
    Type: "FaceIdCount",
    alarm_voice_text: ""
  };

  return payload;
}
