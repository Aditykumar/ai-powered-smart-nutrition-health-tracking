import { Router } from "express";
import { HealthAssessmentModel } from "../models/health-assessment.js";
import { MealModel } from "../models/meal.js";
import { ActivityModel } from "../models/activity.js";
import { UserModel } from "../models/user.js";
import { sendDailySummaryEmail } from "../services/email.js";

export const emailRouter = Router();

// POST /api/email/daily-summary
emailRouter.post("/daily-summary", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const toOverride = String(req.body.to ?? "").trim();
    const date = String(req.body.date ?? new Date().toISOString().slice(0, 10));

    // Resolve recipient email (userId may not be a valid ObjectId for demo users)
    const user = userId.match(/^[a-f\d]{24}$/i) ? await UserModel.findById(userId).lean() : null;
    const to = toOverride || user?.email || "";

    if (!to) {
      res.status(400).json({ message: "No email address found. Add an email to your account or enter one below." });
      return;
    }

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
    const score = Math.max(0, Math.round(100 - Math.abs(consumed.calories - targets.calories) / 30));

    const calRatio = consumed.calories / targets.calories;
    const recommendations: string[] = [];
    if (consumed.calories < targets.calories * 0.8) recommendations.push("Eat more today — you're under your calorie target.");
    else if (consumed.calories > targets.calories * 1.2) recommendations.push("You've exceeded your calorie target — go lighter tomorrow.");
    else recommendations.push("Great balance today — keep it up!");
    if (consumed.proteinG < targets.proteinG * 0.8) recommendations.push("Add a protein-rich food like eggs, chicken, or dal.");
    if (activityBurn === 0) recommendations.push("Add some light activity — even a 20-min walk counts.");

    const result = await sendDailySummaryEmail({
      to,
      name: user?.name ?? "there",
      date,
      consumed,
      targets,
      meals: meals.map((m) => ({ name: m.name, quantity: m.quantity, calories: m.nutrients.calories })),
      activityBurn,
      score,
      recommendations,
    });

    res.json({ ...result, to });
  } catch (error) {
    next(error);
  }
});
