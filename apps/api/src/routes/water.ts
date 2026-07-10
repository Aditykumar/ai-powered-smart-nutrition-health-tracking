import { Router } from "express";
import { WaterLogModel } from "../models/water-log.js";

export const waterRouter = Router();

// Get water logs for a date
waterRouter.get("/", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));

    const logs = await WaterLogModel.find({ userId, date }).sort({ loggedAt: 1 }).lean();
    const totalMl = logs.reduce((sum, l) => sum + l.amountMl, 0);

    res.json({ logs, totalMl, date });
  } catch (error) {
    next(error);
  }
});

// Log water intake
waterRouter.post("/", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const amountMl = Number(req.body.amountMl ?? 250);
    const date = String(req.body.date ?? new Date().toISOString().slice(0, 10));

    const log = await WaterLogModel.create({ userId, amountMl, date });
    const all = await WaterLogModel.find({ userId, date }).lean();
    const totalMl = all.reduce((sum, l) => sum + l.amountMl, 0);

    res.status(201).json({ log, totalMl });
  } catch (error) {
    next(error);
  }
});

// Delete a water log entry
waterRouter.delete("/:id", async (req, res, next) => {
  try {
    await WaterLogModel.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Weekly water summary
waterRouter.get("/weekly", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const today = new Date();
    const days: { date: string; totalMl: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const logs = await WaterLogModel.find({ userId, date }).lean();
      const totalMl = logs.reduce((sum, l) => sum + l.amountMl, 0);
      days.push({ date, totalMl });
    }

    res.json({ days });
  } catch (error) {
    next(error);
  }
});
