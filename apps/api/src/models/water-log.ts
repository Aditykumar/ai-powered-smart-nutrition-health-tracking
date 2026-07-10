import { Schema, model } from "mongoose";

const waterLogSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    amountMl: { type: Number, required: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    loggedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const WaterLogModel = model("WaterLog", waterLogSchema);
