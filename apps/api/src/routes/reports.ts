import { Router } from "express";
import { analyzeBloodReport, extractPdfTextFromDataUrl } from "../services/ai.js";
import { BloodReportModel } from "../models/blood-report.js";
import { HealthAssessmentModel } from "../models/health-assessment.js";
import { estimateDailyCalories, getMacroTargets } from "../utils/nutrition.js";
import type { UserProfile } from "@nutrition/shared";

export const reportsRouter = Router();

reportsRouter.post("/blood", async (req, res, next) => {
  try {
    const userId = String(req.body.userId ?? req.header("x-user-id") ?? "demo-user");
    const weightKg = Number(req.body.weightKg);
    const fileDataUrl = String(req.body.fileDataUrl ?? "");
    const fileName = String(req.body.fileName ?? "blood-report");
    const fileType = String(req.body.fileType ?? "application/octet-stream");

    const extractedText = fileDataUrl.startsWith("data:application/pdf")
      ? await extractPdfTextFromDataUrl(fileDataUrl)
      : String(req.body.reportText ?? "");

    const analysis = req.body.analysis ?? null;

    const manualProfile = (req.body.manualProfile ?? {}) as Partial<UserProfile>;
    const suggestedProfile: UserProfile = {
      age: Number(manualProfile.age ?? analysis.profileHints?.age ?? 28),
      heightCm: Number(manualProfile.heightCm ?? 170),
      weightKg,
      gender: (manualProfile.gender ?? analysis.profileHints?.gender ?? "prefer_not_to_say") as UserProfile["gender"],
      activityLevel: (manualProfile.activityLevel ?? analysis.profileHints?.activityLevel ?? "moderate") as UserProfile["activityLevel"],
      goal: (manualProfile.goal ?? analysis.profileHints?.goal ?? "maintenance") as UserProfile["goal"],
      healthConditions: (manualProfile.healthConditions ?? analysis.profileHints?.healthConditions ?? []) as UserProfile["healthConditions"],
      allergies: (manualProfile.allergies ?? []) as UserProfile["allergies"],
      dietaryPreferences: (manualProfile.dietaryPreferences ?? analysis.profileHints?.dietaryPreferences ?? []) as UserProfile["dietaryPreferences"],
    };

    const targetCalories = estimateDailyCalories(suggestedProfile);
    const macroTargets = getMacroTargets(targetCalories, suggestedProfile.goal);
    const savedAssessment = await HealthAssessmentModel.findOneAndUpdate(
      { userId },
      {
        userId,
        ...suggestedProfile,
        targetCalories,
        macroTargets,
        bloodReportAnalysis: analysis,
        profileSource: "blood-report",
      },
      { new: true, upsert: true },
    ).lean();

    const savedReport = await BloodReportModel.create({
      userId,
      fileName,
      fileType,
      rawText: extractedText,
      analysis,
      profileDraft: suggestedProfile,
    });

    res.json({
      report: savedReport,
      assessment: savedAssessment,
      analysis,
    });
  } catch (error) {
    next(error);
  }
});
