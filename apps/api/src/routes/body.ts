import { Router } from "express";
import { BodyMetricModel } from "../models/body-metric.js";

export const bodyRouter = Router();

// List body metrics (last 30 days)
bodyRouter.get("/", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? req.header("x-user-id") ?? "demo-user");
    const metrics = await BodyMetricModel.find({ userId }).sort({ date: -1 }).limit(90).lean();
    res.json({ metrics });
  } catch (error) {
    next(error);
  }
});

// Log body metric
bodyRouter.post("/", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const date = String(req.body.date ?? new Date().toISOString().slice(0, 10));

    // Upsert by userId + date
    const metric = await BodyMetricModel.findOneAndUpdate(
      { userId, date },
      {
        $set: {
          weightKg: req.body.weightKg ?? undefined,
          bmi: req.body.bmi ?? undefined,
          bodyFatPercent: req.body.bodyFatPercent ?? undefined,
          muscleMassKg: req.body.muscleMassKg ?? undefined,
          waistCm: req.body.waistCm ?? undefined,
          notes: req.body.notes ?? "",
        },
      },
      { upsert: true, new: true },
    );

    res.status(201).json({ metric });
  } catch (error) {
    next(error);
  }
});

// Delete a metric
bodyRouter.delete("/:id", async (req, res, next) => {
  try {
    await BodyMetricModel.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
