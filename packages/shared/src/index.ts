export type Gender = "female" | "male" | "non_binary" | "prefer_not_to_say";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type Goal = "weight_loss" | "muscle_gain" | "maintenance";

export type HealthCondition =
  | "diabetes"
  | "thyroid"
  | "hypertension"
  | "pcos"
  | "high_cholesterol"
  | "none"
  | "other";

export type DietaryPreference =
  | "vegetarian"
  | "vegan"
  | "eggetarian"
  | "keto"
  | "high_protein"
  | "low_carb"
  | "halal"
  | "jain"
  | "none";

export interface UserProfile {
  age: number;
  heightCm: number;
  weightKg: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  goal: Goal;
  healthConditions: HealthCondition[];
  allergies: string[];
  dietaryPreferences: DietaryPreference[];
}

export interface NutrientBreakdown {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
}

export interface FoodEntry {
  id: string;
  name: string;
  source: "manual" | "photo" | "barcode";
  quantity: string;
  nutrients: NutrientBreakdown;
  createdAt: string;
}

export interface DailySummary {
  date: string;
  consumed: NutrientBreakdown;
  targets: NutrientBreakdown;
  remaining: NutrientBreakdown;
  score: number;
}

export { estimateDailyCalories, getMacroTargets } from "./nutrition.js";
