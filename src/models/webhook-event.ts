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

export const WebhookEventModel: Model<WebhookEventDocument> =
  mongoose.models.WebhookEvent ||
  mongoose.model<WebhookEventDocument>("WebhookEvent", WebhookEventSchema);
