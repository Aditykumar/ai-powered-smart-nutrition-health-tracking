import { Router } from "express";
import { HealthAssessmentModel } from "../models/health-assessment.js";
import { MealModel } from "../models/meal.js";
import { ActivityModel } from "../models/activity.js";
import { sendWhatsAppSummary } from "../services/whatsapp.js";
import { env } from "../config/env.js";

export const whatsappRouter = Router();

function buildSummaryMessage({
  date,
  meals,
  summary,
  activityBurn,
}: {
  date: string;
  meals: Array<{ name: string; quantity: string }>;
  summary: {
    consumed: { calories: number; proteinG: number; carbsG: number; fatG: number };
    targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
    score: number;
    goalAchievementPercentage: number;
  };
  activityBurn: number;
}) {
  const mealText = meals.length ? meals.map((meal) => `${meal.name} (${meal.quantity})`).join(", ") : "No meals logged";

  return [
    `Daily summary for ${date}`,
    `Meals: ${mealText}`,
    `Calories: ${Math.round(summary.consumed.calories)} / ${Math.round(summary.targets.calories)}`,
    `Protein: ${Math.round(summary.consumed.proteinG)}g, Carbs: ${Math.round(summary.consumed.carbsG)}g, Fat: ${Math.round(summary.consumed.fatG)}g`,
    `Activity burn: ${Math.round(activityBurn)} kcal`,
    `Score: ${summary.score}/100`,
    `Goal achievement: ${summary.goalAchievementPercentage}%`,
  ].join("\n");
}

whatsappRouter.post("/daily-summary", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const to = String(req.body.to ?? "");
    const date = String(req.body.date ?? new Date().toISOString().slice(0, 10));

    const assessment = await HealthAssessmentModel.findOne({ userId }).lean();
    const meals = await MealModel.find({
      userId,
      eatenAt: {
        $gte: `${date}T00:00:00.000Z`,
        $lt: `${date}T23:59:59.999Z`,
      },
    }).lean();
    const activities = await ActivityModel.find({
      userId,
      createdAt: {
        $gte: new Date(`${date}T00:00:00.000Z`),
        $lt: new Date(`${date}T23:59:59.999Z`),
      },
    }).lean();

    const consumed = meals.reduce(
      (totals, meal) => ({
        calories: totals.calories + meal.nutrients.calories,
        proteinG: totals.proteinG + meal.nutrients.proteinG,
        carbsG: totals.carbsG + meal.nutrients.carbsG,
        fatG: totals.fatG + meal.nutrients.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    const activityBurn = activities.reduce((sum, activity) => sum + (activity.avgCalBurn ?? 0), 0);

    const targets = assessment?.macroTargets ?? {
      calories: 2000,
      proteinG: 100,
      carbsG: 225,
      fatG: 67,
    };

    const summary = {
      consumed,
      targets,
      score: Math.max(0, Math.round(100 - Math.abs(consumed.calories - targets.calories) / 30)),
      goalAchievementPercentage: Math.min(100, Math.round((consumed.calories / targets.calories) * 100)),
    };

    const message = buildSummaryMessage({
      date,
      meals: meals.map((meal) => ({ name: meal.name, quantity: meal.quantity })),
      summary,
      activityBurn,
    });

    const result = await sendWhatsAppSummary({
      to: to || env.whatsappToNumber || "",
      message,
    });

    res.json({
      ...result,
      message,
    });
  } catch (error) {
    next(error);
  }
});
