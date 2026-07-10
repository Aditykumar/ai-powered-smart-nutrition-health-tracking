import { Router } from "express";
import { analyzeActivity } from "../services/ai.js";
import { ActivityModel } from "../models/activity.js";
import { HealthAssessmentModel } from "../models/health-assessment.js";

export const activitiesRouter = Router();

activitiesRouter.post("/analyze", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const stepCount = req.body.stepCount == null ? undefined : Number(req.body.stepCount);
    const durationMinutes = req.body.durationMinutes == null ? undefined : Number(req.body.durationMinutes);
    const fileDataUrl = typeof req.body.fileDataUrl === "string" ? req.body.fileDataUrl : undefined;
    const fileName = String(req.body.fileName ?? "activity");

    const assessment = await HealthAssessmentModel.findOne({ userId }).lean();
    const weightKg = Number(req.body.weightKg ?? assessment?.weightKg ?? 70);
    const analysis = await analyzeActivity({
      fileDataUrl,
      stepCount,
      weightKg,
      durationMinutes,
    });

    const saved = await ActivityModel.create({
      userId,
      source: fileDataUrl ? "photo" : "manual",
      fileName,
      stepCount: Number(analysis.stepCount ?? stepCount ?? 0),
      durationMinutes: analysis.durationMinutes ?? durationMinutes,
      avgCalBurn: Number(analysis.avgCalBurn ?? 0),
      activityType: String(analysis.activityType ?? "walking"),
      notes: String(analysis.notes ?? ""),
    });

    res.json({
      item: saved,
      analysis,
    });
  } catch (error) {
    next(error);
  }
});
