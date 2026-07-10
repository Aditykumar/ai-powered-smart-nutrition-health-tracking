import { Router } from "express";
import { MealModel } from "../models/meal.js";
import { ActivityModel } from "../models/activity.js";
import { WaterLogModel } from "../models/water-log.js";
import { BodyMetricModel } from "../models/body-metric.js";
import { HealthAssessmentModel } from "../models/health-assessment.js";

export const trendsRouter = Router();

trendsRouter.get("/weekly", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const days = Number(req.query.days ?? 7);
    const assessment = await HealthAssessmentModel.findOne({ userId }).lean();
    const targetCalories = assessment?.macroTargets?.calories ?? 2000;

    const today = new Date();
    const result: object[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);

      const meals = await MealModel.find({
        userId,
        eatenAt: { $gte: `${date}T00:00:00.000Z`, $lt: `${date}T23:59:59.999Z` },
      }).lean();

      const activities = await ActivityModel.find({
        userId,
        createdAt: { $gte: new Date(`${date}T00:00:00.000Z`), $lt: new Date(`${date}T23:59:59.999Z`) },
      }).lean();

      const waterLogs = await WaterLogModel.find({ userId, date }).lean();
      const bodyMetric = await BodyMetricModel.findOne({ userId, date }).lean();

      const calories = meals.reduce((s, m) => s + m.nutrients.calories, 0);
      const proteinG = meals.reduce((s, m) => s + m.nutrients.proteinG, 0);
      const carbsG = meals.reduce((s, m) => s + m.nutrients.carbsG, 0);
      const fatG = meals.reduce((s, m) => s + m.nutrients.fatG, 0);
      const fiberG = meals.reduce((s, m) => s + m.nutrients.fiberG, 0);
      const activityBurn = activities.reduce((s, a) => s + (a.avgCalBurn ?? 0), 0);
      const waterMl = waterLogs.reduce((s, w) => s + w.amountMl, 0);

      result.push({
        date,
        calories,
        proteinG,
        carbsG,
        fatG,
        fiberG,
        activityBurn,
        netCalories: calories - activityBurn,
        waterMl,
        mealCount: meals.length,
        weightKg: bodyMetric?.weightKg ?? null,
        goalMet: calories >= targetCalories * 0.8 && calories <= targetCalories * 1.2,
      });
    }

    // Streak: consecutive days with at least 1 meal logged
    let streak = 0;
    const sortedDays = [...result].reverse() as { mealCount: number }[];
    for (const day of sortedDays) {
      if (day.mealCount > 0) streak++;
      else break;
    }

    res.json({ days: result, streak, targetCalories });
  } catch (error) {
    next(error);
  }
});
