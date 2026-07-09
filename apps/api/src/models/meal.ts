import { Schema, model } from "mongoose";

const nutrientSchema = new Schema(
  {
    calories: { type: Number, required: true },
    proteinG: { type: Number, required: true },
    carbsG: { type: Number, required: true },
    fatG: { type: Number, required: true },
    fiberG: { type: Number, required: true },
    sugarG: { type: Number, default: 0 },
    sodiumMg: { type: Number, default: 0 },
  },
  { _id: false },
);

const mealSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    source: { type: String, required: true },
    quantity: { type: String, required: true },
    nutrients: { type: nutrientSchema, required: true },
    eatenAt: { type: String, required: true, index: true },
    recognizedFoods: { type: [String], default: [] },
    ingredientsUsed: { type: [String], default: [] },
    confidence: { type: Number, default: 0 },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const MealModel = model("Meal", mealSchema);
