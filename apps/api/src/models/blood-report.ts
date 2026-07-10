import { Schema, model } from "mongoose";

const bloodReportSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    rawText: { type: String, default: "" },
    analysis: { type: Schema.Types.Mixed, required: true },
    profileDraft: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const BloodReportModel = model("BloodReport", bloodReportSchema);
