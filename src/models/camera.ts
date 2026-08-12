import mongoose, { Model, Schema } from "mongoose";

// Camera do người dùng quản lý từ dashboard (CRUD). Mongo là nguồn sự thật;
// path trong MediaMTX được đồng bộ theo collection này qua Control API
// (xem src/lib/aibox/mediamtx-paths.ts) — không sửa mediamtx.yml nữa.
export interface CameraDocument {
  /** Trùng tên path MediaMTX, server tự sinh dạng "camNN", bất biến. */
  code: string;
  /** Tên hiển thị, vd "Camera cổng chính". */
  name: string;
  /** Vị trí lắp đặt (tuỳ chọn). */
  location?: string;
  /**
   * RTSP nguồn, có thể chứa user:pass. Chỉ trả về client trong ngữ cảnh
   * chỉnh sửa (dashboard 1 admin, đi qua HTTPS + cookie-auth).
   */
  rtspUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const CameraSchema = new Schema<CameraDocument>(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    location: { type: String },
    rtspUrl: { type: String, required: true }
  },
  {
    collection: "cameras",
    timestamps: true
  }
);

export const CameraModel: Model<CameraDocument> =
  mongoose.models.Camera || mongoose.model<CameraDocument>("Camera", CameraSchema);
