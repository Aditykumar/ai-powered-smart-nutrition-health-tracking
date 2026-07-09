import { Router } from "express";
import { MealModel } from "../models/meal.js";
import { analyzeFoodPhoto } from "../services/ai.js";

export const mealsRouter = Router();

mealsRouter.get("/", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const items = await MealModel.find({ userId }).sort({ eatenAt: -1 }).lean();

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

mealsRouter.post("/", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const item = await MealModel.create({
      userId,
      name: req.body.name,
      source: req.body.source,
      quantity: req.body.quantity,
      nutrients: req.body.nutrients,
      eatenAt: req.body.eatenAt ?? new Date().toISOString(),
    });

    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

mealsRouter.post("/analyze", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const fileDataUrl = String(req.body.fileDataUrl ?? "");
    const quantity = String(req.body.quantity ?? "");
    const ingredients = String(req.body.ingredients ?? "");
    const note = String(req.body.note ?? "");
    const eatenAt = typeof req.body.eatenAt === "string" ? req.body.eatenAt : new Date().toISOString();
    const analysis = await analyzeFoodPhoto({ fileDataUrl, quantity, ingredients, note });

    const item = await MealModel.create({
      userId,
      name: analysis.name,
      source: "photo",
      quantity: analysis.quantity,
      nutrients: analysis.nutrients,
      eatenAt,
      recognizedFoods: analysis.recognizedFoods,
      ingredientsUsed: analysis.ingredientsUsed,
      confidence: analysis.confidence,
      notes: analysis.notes,
    });

    res.status(201).json({ item, analysis });
  } catch (error) {
    next(error);
  }
});
