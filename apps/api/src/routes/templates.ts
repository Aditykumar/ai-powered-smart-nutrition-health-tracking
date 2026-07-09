import { Router } from "express";
import { MealTemplateModel } from "../models/meal-template.js";
import { MealModel } from "../models/meal.js";

export const templatesRouter = Router();

// List templates
templatesRouter.get("/", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const templates = await MealTemplateModel.find({ userId }).sort({ usageCount: -1, updatedAt: -1 }).lean();
    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// Create template
templatesRouter.post("/", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const items = req.body.items ?? [];

    // Auto-compute total nutrients
    const totalNutrients = items.reduce(
      (acc: Record<string, number>, item: { nutrients: Record<string, number> }) => {
        for (const key of Object.keys(item.nutrients ?? {})) {
          acc[key] = (acc[key] ?? 0) + (item.nutrients[key] ?? 0);
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    const template = await MealTemplateModel.create({
      userId,
      name: req.body.name,
      description: req.body.description ?? "",
      mealType: req.body.mealType ?? "snack",
      items,
      totalNutrients,
      tags: req.body.tags ?? [],
    });

    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
});

// Log a template as a meal (use template)
templatesRouter.post("/:id/log", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const template = await MealTemplateModel.findById(req.params.id).lean();
    if (!template) return res.status(404).json({ message: "Template not found" });

    const eatenAt = req.body.eatenAt ?? new Date().toISOString();
    const meal = await MealModel.create({
      userId,
      name: template.name,
      source: "template",
      quantity: "1 serving",
      nutrients: {
        calories: template.totalNutrients.calories ?? 0,
        proteinG: template.totalNutrients.proteinG ?? 0,
        carbsG: template.totalNutrients.carbsG ?? 0,
        fatG: template.totalNutrients.fatG ?? 0,
        fiberG: template.totalNutrients.fiberG ?? 0,
        sugarG: template.totalNutrients.sugarG ?? 0,
        sodiumMg: template.totalNutrients.sodiumMg ?? 0,
      },
      eatenAt,
      notes: `From template: ${template.name}`,
    });

    // Increment usage count
    await MealTemplateModel.findByIdAndUpdate(req.params.id, { $inc: { usageCount: 1 } });

    res.status(201).json({ meal });
  } catch (error) {
    next(error);
  }
});

// Delete template
templatesRouter.delete("/:id", async (req, res, next) => {
  try {
    await MealTemplateModel.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
