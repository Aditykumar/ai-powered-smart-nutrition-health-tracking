import { Schema, model } from "mongoose";

const templateNutrientSchema = new Schema(
  {
    calories: { type: Number, default: 0 },
    proteinG: { type: Number, default: 0 },
    carbsG: { type: Number, default: 0 },
    fatG: { type: Number, default: 0 },
    fiberG: { type: Number, default: 0 },
    sugarG: { type: Number, default: 0 },
    sodiumMg: { type: Number, default: 0 },
  },
  { _id: false },
);

const templateItemSchema = new Schema(
  {
    name: { type: String, required: true },
    quantity: { type: String, required: true },
    nutrients: { type: templateNutrientSchema, required: true },
  },
  { _id: false },
);

const mealTemplateSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    mealType: { type: String, enum: ["breakfast", "lunch", "dinner", "snack", "recipe"], default: "snack" },
    items: { type: [templateItemSchema], default: [] },
    totalNutrients: { type: templateNutrientSchema, default: {} },
    tags: { type: [String], default: [] },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const MealTemplateModel = model("MealTemplate", mealTemplateSchema);
