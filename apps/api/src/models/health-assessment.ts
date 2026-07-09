import { Schema, model } from "mongoose";

const healthAssessmentSchema = new Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    age: { type: Number, required: true },
    heightCm: { type: Number, required: true },
    weightKg: { type: Number, required: true },
    gender: { type: String, required: true },
    activityLevel: { type: String, required: true },
    goal: { type: String, required: true },
    healthConditions: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    dietaryPreferences: { type: [String], default: [] },
    targetCalories: { type: Number, required: true },
    macroTargets: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const HealthAssessmentModel = model("HealthAssessment", healthAssessmentSchema);
