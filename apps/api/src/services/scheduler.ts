import { HealthAssessmentModel } from "../models/health-assessment.js";
import { MealModel } from "../models/meal.js";
import { ActivityModel } from "../models/activity.js";
import { sendWhatsAppSummary } from "./whatsapp.js";

export async function sendDailySummary(userId = "demo-user") {
  const date = new Date().toISOString().slice(0, 10);
  const toNumber = process.env.WHATSAPP_TO_NUMBER ?? "";

  if (!toNumber) {
    console.warn("WHATSAPP_TO_NUMBER not set — skipping scheduled summary.");
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
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const activityBurn = activities.reduce((sum, a) => sum + (a.avgCalBurn ?? 0), 0);
  const targets = assessment?.macroTargets ?? { calories: 2000, proteinG: 100, carbsG: 225, fatG: 67 };
  const score = Math.max(0, Math.round(100 - Math.abs(consumed.calories - targets.calories) / 30));
  const mealText = meals.length ? meals.map((m) => `${m.name} (${m.quantity})`).join(", ") : "No meals logged";

  const message = [
    `NutriCore Daily Summary — ${date}`,
    `Meals: ${mealText}`,
    `Calories: ${Math.round(consumed.calories)} / ${Math.round(targets.calories)}`,
    `Protein: ${Math.round(consumed.proteinG)}g  Carbs: ${Math.round(consumed.carbsG)}g  Fat: ${Math.round(consumed.fatG)}g`,
    `Activity burn: ${Math.round(activityBurn)} kcal`,
    `Score: ${score}/100`,
  ].join("\n");

  const result = await sendWhatsAppSummary({ to: toNumber, message });
  console.log("Scheduled WhatsApp summary:", result.sent ? "sent" : result.reason);
}
