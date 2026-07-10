import { Schema, model } from "mongoose";

const bodyMetricSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    weightKg: { type: Number },
    bmi: { type: Number },
    bodyFatPercent: { type: Number },
    muscleMassKg: { type: Number },
    waistCm: { type: Number },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

bodyMetricSchema.index({ userId: 1, date: -1 });

export const BodyMetricModel = model("BodyMetric", bodyMetricSchema);
