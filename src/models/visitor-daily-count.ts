import mongoose, { Model, Schema } from "mongoose";

// Written by the Python face-dedup worker (see face-matching/worker.py). One doc
// per box-local day: `_id` is the "YYYY-MM-DD" key, `unique_count` is the number
// of distinct visitors first seen that day. Read-only from the dashboard.
export interface VisitorDailyCountDocument {
  _id: string; // YYYY-MM-DD (Asia/Ho_Chi_Minh day)
  unique_count: number;
  updated_at?: Date;
}

const VisitorDailyCountSchema = new Schema<VisitorDailyCountDocument>(
  {
    _id: { type: String, required: true },
    unique_count: { type: Number, required: true, default: 0 },
    updated_at: { type: Date }
  },
  { collection: "visitor_daily_counts", versionKey: false }
);

export const VisitorDailyCountModel: Model<VisitorDailyCountDocument> =
  mongoose.models.VisitorDailyCount ||
  mongoose.model<VisitorDailyCountDocument>("VisitorDailyCount", VisitorDailyCountSchema);
