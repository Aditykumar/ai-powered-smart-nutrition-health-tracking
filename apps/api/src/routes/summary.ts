import { Router } from "express";
import { MealModel } from "../models/meal.js";
import { HealthAssessmentModel } from "../models/health-assessment.js";
import { ActivityModel } from "../models/activity.js";
import type { DailySummary } from "@nutrition/shared";

const zero = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
};

export const summaryRouter = Router();

summaryRouter.get("/:date", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const assessment = await HealthAssessmentModel.findOne({ userId }).lean();
    const items = await MealModel.find({
      userId,
      eatenAt: {
        $gte: `${req.params.date}T00:00:00.000Z`,
        $lt: `${req.params.date}T23:59:59.999Z`,
      },
    }).lean();
    const activities = await ActivityModel.find({
      userId,
      createdAt: {
        $gte: new Date(`${req.params.date}T00:00:00.000Z`),
        $lt: new Date(`${req.params.date}T23:59:59.999Z`),
      },
    }).lean();

    const consumed = items.reduce(
      (totals, meal) => ({
        calories: totals.calories + meal.nutrients.calories,
        proteinG: totals.proteinG + meal.nutrients.proteinG,
        carbsG: totals.carbsG + meal.nutrients.carbsG,
        fatG: totals.fatG + meal.nutrients.fatG,
        fiberG: totals.fiberG + meal.nutrients.fiberG,
        sugarG: totals.sugarG + meal.nutrients.sugarG,
        sodiumMg: totals.sodiumMg + meal.nutrients.sodiumMg,
      }),
      { ...zero },
    );

    const targets = assessment?.macroTargets ?? {
      calories: 2000,
      proteinG: 100,
      carbsG: 225,
      fatG: 67,
      fiberG: 28,
      sugarG: 25,
      sodiumMg: 2300,
    };

    const remaining = {
      calories: Math.max(targets.calories - consumed.calories, 0),
      proteinG: Math.max(targets.proteinG - consumed.proteinG, 0),
      carbsG: Math.max(targets.carbsG - consumed.carbsG, 0),
      fatG: Math.max(targets.fatG - consumed.fatG, 0),
      fiberG: Math.max(targets.fiberG - consumed.fiberG, 0),
      sugarG: Math.max(targets.sugarG - consumed.sugarG, 0),
      sodiumMg: Math.max(targets.sodiumMg - consumed.sodiumMg, 0),
    };

    const score = Math.max(
      0,
      Math.round(
        100 -
          ((Math.abs(remaining.calories) / targets.calories) * 40 +
            (Math.abs(remaining.proteinG) / targets.proteinG) * 20 +
            (Math.abs(remaining.fiberG) / targets.fiberG) * 15 +
            (Math.abs(remaining.sodiumMg) / targets.sodiumMg) * 15 +
            (consumed.sugarG > targets.sugarG ? 10 : 0)),
      ),
    );

    const summary: DailySummary = {
      date: req.params.date,
      consumed,
      targets,
      remaining,
      score,
    };

    res.json({
      ...summary,
      meals: items,
      activityBurn: activities.reduce((sum, activity) => sum + (activity.avgCalBurn ?? 0), 0),
      goalAchievementPercentage: Math.min(100, Math.round((consumed.calories / targets.calories) * 100)),
    });
  } catch (error) {
    next(error);
  }
});
