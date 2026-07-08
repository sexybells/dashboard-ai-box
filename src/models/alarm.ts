import mongoose, { Model, Schema } from "mongoose";

export interface AlarmDocument {
  dedupeKey: string;
  alarmId?: string;
  uniqueId?: string;
  taskSession?: string;
  taskDesc?: string;
  summary?: string;
  description?: string;
  time?: Date;
  timeText?: string;
  timestamp?: number;
  boardId?: string;
  boardIp?: string;
  mediaName?: string;
  mediaUrl?: string;
  imageKind: "base64" | "aibox-path" | "none";
  imageUrl?: string | null;
  imagePath?: string | null;
  imageOriginal?: string;
  raw: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AlarmSchema = new Schema<AlarmDocument>(
  {
    dedupeKey: { type: String, required: true, unique: true, index: true },
    alarmId: { type: String, index: true },
    uniqueId: { type: String, index: true },
    taskSession: { type: String, index: true },
    taskDesc: { type: String },
    summary: { type: String, index: true },
    description: { type: String, index: true },
    time: { type: Date, index: true },
    timeText: { type: String },
    timestamp: { type: Number },
    boardId: { type: String },
    boardIp: { type: String },
    mediaName: { type: String, index: true },
    mediaUrl: { type: String },
    imageKind: {
      type: String,
      enum: ["base64", "aibox-path", "none"],
      default: "none",
      required: true
    },
    imageUrl: { type: String, default: null },
    imagePath: { type: String, default: null },
    imageOriginal: { type: String },
    raw: { type: Schema.Types.Mixed, required: true }
  },
  {
    collection: "alarms",
    timestamps: true
  }
);

AlarmSchema.index({ time: -1, taskSession: 1 });
AlarmSchema.index({ summary: 1, time: -1 });
AlarmSchema.index({ mediaName: 1, time: -1 });

export const AlarmModel: Model<AlarmDocument> =
  mongoose.models.Alarm || mongoose.model<AlarmDocument>("Alarm", AlarmSchema);
