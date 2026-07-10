import { Router } from "express";
import type { UserProfile } from "@nutrition/shared";
import { HealthAssessmentModel } from "../models/health-assessment.js";
import { estimateDailyCalories, getMacroTargets } from "../utils/nutrition.js";

export const healthRouter = Router();

healthRouter.post("/assessment", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const profile = req.body as UserProfile;
    const targetCalories = estimateDailyCalories(profile);
    const macroTargets = getMacroTargets(targetCalories, profile.goal);

    const saved = await HealthAssessmentModel.findOneAndUpdate(
      { userId },
      {
        userId,
        ...profile,
        targetCalories,
        macroTargets,
      },
      { new: true, upsert: true },
    ).lean();

    res.json(saved);
  } catch (error) {
    next(error);
  }
});

healthRouter.get("/assessment/:userId", async (req, res, next) => {
  try {
    const assessment = await HealthAssessmentModel.findOne({ userId: req.params.userId }).lean();

    if (!assessment) {
      res.status(404).json({ message: "Health assessment not found" });
      return;
    }

    res.json(assessment);
  } catch (error) {
    next(error);
  }
});
