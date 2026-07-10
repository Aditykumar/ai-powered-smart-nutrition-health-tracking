import { Schema, model } from "mongoose";

const activitySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    source: { type: String, required: true },
    fileName: { type: String },
    stepCount: { type: Number, required: true },
    durationMinutes: { type: Number },
    avgCalBurn: { type: Number, required: true },
    activityType: { type: String, required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const ActivityModel = model("Activity", activitySchema);
