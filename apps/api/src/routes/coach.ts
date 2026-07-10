import { Router } from "express";
import { HealthAssessmentModel } from "../models/health-assessment.js";
import { MealModel } from "../models/meal.js";
import { ActivityModel } from "../models/activity.js";
import { askCoach } from "../services/ai.js";

export const coachRouter = Router();

// POST /api/coach/ask — answers a nutrition question grounded in today's logged data
coachRouter.post("/ask", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const question = String(req.body.question ?? "").trim() || "What should I eat for the rest of today?";
    const date = String(req.body.date ?? new Date().toISOString().slice(0, 10));

    const assessment = await HealthAssessmentModel.findOne({ userId }).lean();
    const meals = await MealModel.find({
      userId,
      eatenAt: { $gte: `${date}T00:00:00.000Z`, $lt: `${date}T23:59:59.999Z` },
    }).lean();
    const activities = await ActivityModel.find({
      userId,
      createdAt: { $gte: new Date(`${date}T00:00:00.000Z`), $lt: new Date(`${date}T23:59:59.999Z`) },
    }).lean();

    const consumed = meals.reduce(
      (t, m) => ({
        calories: t.calories + m.nutrients.calories,
        proteinG: t.proteinG + m.nutrients.proteinG,
        carbsG: t.carbsG + m.nutrients.carbsG,
        fatG: t.fatG + m.nutrients.fatG,
        fiberG: t.fiberG + (m.nutrients.fiberG ?? 0),
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    );

    const activityBurn = activities.reduce((s, a) => s + (a.avgCalBurn ?? 0), 0);
    const targets = assessment?.macroTargets ?? { calories: 2000, proteinG: 100, carbsG: 225, fatG: 67 };

    const { answer } = await askCoach({
      question,
      goal: assessment?.goal,
      healthConditions: assessment?.healthConditions,
      dietaryPreferences: assessment?.dietaryPreferences,
      consumed,
      targets,
      meals: meals.map((m) => ({ name: m.name, quantity: m.quantity })),
      activityBurn,
    });

    res.json({ answer });
  } catch (error) {
    next(error);
  }
});
