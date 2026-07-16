import mongoose, { Model, Schema } from "mongoose";

// Kho key/value cho cấu hình chỉnh được từ trang Cài đặt. Hiện chỉ giữ
// `boxHost`; thêm setting mới chỉ cần thêm khoá, không cần model mới.
export interface AppSettingDocument {
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppSettingSchema = new Schema<AppSettingDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: String, required: true }
  },
  {
    collection: "settings",
    timestamps: true
  }
);

export const AppSettingModel: Model<AppSettingDocument> =
  mongoose.models.AppSetting || mongoose.model<AppSettingDocument>("AppSetting", AppSettingSchema);
