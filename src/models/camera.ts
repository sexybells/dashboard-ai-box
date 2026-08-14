import mongoose, { Model, Schema } from "mongoose";

// Camera do người dùng quản lý từ dashboard (CRUD). Mongo là nguồn sự thật.
// Hai loại camera sống chung collection này, phân biệt bằng `source`:
//   - "rtsp"  : path trong MediaMTX đồng bộ theo doc qua Control API
//               (xem src/lib/aibox/mediamtx-paths.ts)
//   - "ezviz" : phát thẳng từ EZVIZ Cloud bằng URL ezopen, KHÔNG có path
//               MediaMTX, không ghi hình về server
export interface CameraDocument {
  /** Trùng tên path MediaMTX với camera RTSP; server tự sinh "camNN", bất biến. */
  code: string;
  /** Tên hiển thị, vd "Camera cổng chính". */
  name: string;
  /** Vị trí lắp đặt (tuỳ chọn). */
  location?: string;
  /** Nguồn camera. Doc tạo trước khi có trường này được đọc như "rtsp". */
  source: "rtsp" | "ezviz";
  /**
   * RTSP nguồn, có thể chứa user:pass. Bắt buộc khi source === "rtsp".
   * Chỉ trả về client trong ngữ cảnh chỉnh sửa (dashboard 1 admin, đi qua
   * HTTPS + cookie-auth).
   */
  rtspUrl?: string;
  /** Serial thiết bị EZVIZ, vd "BE4583385". */
  ezvizSerial?: string;
  /** Kênh trên thiết bị; camera đơn luôn là 1. */
  ezvizChannel?: number;
  /**
   * Mã xác minh in trên tem. device/list KHÔNG trả về mã này nên admin phải
   * nhập tay; thiếu mã thì camera bật mã hoá không phát được.
   */
  ezvizVerifyCode?: string;
  /** camera/list.isEncrypt — camera bật mã hoá bắt buộc có mã xác minh. */
  ezvizEncrypted?: boolean;
  /** Trạng thái online ghi lại ở lần đồng bộ gần nhất (EZVIZ không có MediaMTX). */
  ezvizOnline?: boolean;
  /** Serial biến mất khỏi tài khoản EZVIZ — giữ doc, chỉ đánh dấu. */
  ezvizMissing?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CameraSchema = new Schema<CameraDocument>(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    location: { type: String },
    source: { type: String, enum: ["rtsp", "ezviz"], required: true, default: "rtsp" },
    rtspUrl: { type: String },
    ezvizSerial: { type: String, index: true },
    ezvizChannel: { type: Number },
    ezvizVerifyCode: { type: String },
    ezvizEncrypted: { type: Boolean },
    ezvizOnline: { type: Boolean },
    ezvizMissing: { type: Boolean }
  },
  {
    collection: "cameras",
    timestamps: true
  }
);

export const CameraModel: Model<CameraDocument> =
  mongoose.models.Camera || mongoose.model<CameraDocument>("Camera", CameraSchema);
