import mongoose, { Model, Schema } from "mongoose";

export interface WebhookEventDocument {
  receivedAt: Date;
  source: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<WebhookEventDocument>(
  {
    receivedAt: { type: Date, required: true, index: true },
    source: { type: String, required: true, index: true },
    payloadHash: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true }
  },
  {
    collection: "webhook_events",
    timestamps: true
  }
);

// webhook_events là log thô: chỉ được ghi, không nơi nào đọc. Event đếm người
// (HeadCount) chiếm gần như toàn bộ lưu lượng — hàng chục nghìn doc mỗi ngày —
// nên chỉ giữ 3 ngày gần nhất đủ để truy vết một webhook nghi vấn. Các loại
// event khác (cảnh báo thật, hiếm) không khớp bộ lọc nên được giữ lại.
//
// Đặt tên riêng thay vì để Mongoose tự sinh `receivedAt_1`: `index: true` ở trên
// đã chiếm tên đó, và hai index cùng key khác options sẽ xung đột khi tạo.
WebhookEventSchema.index(
  { receivedAt: 1 },
  {
    name: "headcount_ttl",
    expireAfterSeconds: 3 * 24 * 60 * 60,
    partialFilterExpression: { "payload.Summary": "HeadCount" }
  }
);

export const WebhookEventModel: Model<WebhookEventDocument> =
  mongoose.models.WebhookEvent ||
  mongoose.model<WebhookEventDocument>("WebhookEvent", WebhookEventSchema);
