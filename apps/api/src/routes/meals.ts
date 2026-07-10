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

mealsRouter.patch("/:id", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.quantity !== undefined) updates.quantity = req.body.quantity;
    if (req.body.nutrients !== undefined) updates.nutrients = req.body.nutrients;
    const updated = await MealModel.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updates },
      { new: true }
    ).lean();
    if (!updated) { res.status(404).json({ message: "Meal not found" }); return; }
    res.json({ item: updated });
  } catch (error) { next(error); }
});

mealsRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const deleted = await MealModel.findOneAndDelete({ _id: req.params.id, userId }).lean();
    if (!deleted) { res.status(404).json({ message: "Meal not found" }); return; }
    res.json({ ok: true });
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
