import { HealthAssessmentModel } from "../models/health-assessment.js";
import { MealModel } from "../models/meal.js";
import { ActivityModel } from "../models/activity.js";
import { UserModel } from "../models/user.js";
import { sendDailySummaryEmail } from "./email.js";

// Sends daily email summary to all users who have an email address
export async function sendScheduledDailySummaries() {
  const date = new Date().toISOString().slice(0, 10);
  const users = await UserModel.find({ email: { $exists: true, $ne: null } }).lean();

  if (users.length === 0) {
    console.log("[Scheduler] No users with email — skipping daily summaries.");
    return;
  }

  for (const user of users) {
    try {
      if (!user.email) continue;
      const userId = user._id.toString();

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

      const recommendations: string[] = [];
      if (consumed.calories < targets.calories * 0.8) recommendations.push("Eat more — you're under your calorie target.");
      else if (consumed.calories > targets.calories * 1.2) recommendations.push("You've exceeded your target — go lighter tomorrow.");
      else recommendations.push("Great balance today — keep it up!");
      if (consumed.proteinG < targets.proteinG * 0.8) recommendations.push("Add a protein-rich food like eggs, chicken, or dal.");

      await sendDailySummaryEmail({
        to: user.email,
        name: user.name,
        date,
        consumed,
        targets,
        meals: meals.map((m) => ({ name: m.name, quantity: m.quantity, calories: m.nutrients.calories })),
        activityBurn,
        score,
        recommendations,
      });
    } catch (err) {
      console.error(`[Scheduler] Failed for user ${user.email}:`, err);
    }
  }
}
