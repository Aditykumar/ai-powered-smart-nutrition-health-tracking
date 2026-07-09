import pdfParse from "pdf-parse";
import { env } from "../config/env.js";

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;

  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1));
    }
    return { rawText: text };
  }
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

async function geminiChat(parts: GeminiPart[]) {
  const apiKey = env.geminiApiKey;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  ).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini request failed: ${message}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return extractJson(content);
}

function dataUrlToInlinePart(fileDataUrl: string): GeminiPart {
  const [header, data] = fileDataUrl.split(",");
  const mime_type = header?.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  return { inline_data: { mime_type, data: data ?? "" } };
}

export async function analyzeBloodReport({
  fileDataUrl,
  extraText,
  weightKg,
}: { fileDataUrl?: string; extraText?: string; weightKg: number }) {
  const prompt = `You are analyzing a blood report for a nutrition app.
Extract relevant health indicators, flag possible concerns, and suggest a profile summary.
Return JSON with:
{
  "summary": string,
  "keyFindings": string[],
  "flags": string[],
  "suggestedTargets": { "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number },
  "profileHints": { "gender": string, "age": number | null, "activityLevel": string, "goal": string, "healthConditions": string[], "dietaryPreferences": string[] }
}
Use the provided weight ${weightKg} kg. If values are unknown, infer cautiously and mark as uncertain in the summary.
${extraText ? `Blood report text:\n${extraText}` : ""}`;

  if (!env.geminiApiKey) {
    return {
      summary: "Gemini API key is not configured. Add GEMINI_API_KEY to enable automated blood report reading.",
      keyFindings: ["Add GEMINI_API_KEY to enable automated blood report reading."],
      flags: ["Manual review required"],
      suggestedTargets: null,
      profileHints: {
        gender: "prefer_not_to_say",
        age: null,
        activityLevel: "moderate",
        goal: "maintenance",
        healthConditions: [],
        dietaryPreferences: [],
      },
    };
  }

  const parts: GeminiPart[] = [{ text: prompt }];
  if (fileDataUrl && !fileDataUrl.startsWith("data:application/pdf")) {
    parts.push(dataUrlToInlinePart(fileDataUrl));
  }

  return geminiChat(parts);
}

export async function extractPdfTextFromDataUrl(fileDataUrl: string) {
  try {
    const buffer = Buffer.from(fileDataUrl.split(",")[1] ?? "", "base64");
    const result = await pdfParse(buffer);
    return result.text;
  } catch {
    return "";
  }
}

export async function analyzeFoodPhoto({
  fileDataUrl,
  ingredients,
  quantity,
  note,
}: {
  fileDataUrl: string;
  ingredients?: string;
  quantity?: string;
  note?: string;
}) {
  const prompt = `You are analyzing a food photo for nutrition tracking.
Estimate food name(s), portion size, calories, protein, carbs, fat, fiber, sugar, sodium, and confidence.
Return JSON with:
{
  "name": string,
  "quantity": string,
  "confidence": number,
  "recognizedFoods": string[],
  "ingredientsUsed": string[],
  "nutrients": { "calories": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number, "sugarG": number, "sodiumMg": number },
  "notes": string
}
${quantity ? `Quantity: ${quantity}` : ""}
${ingredients ? `Ingredients: ${ingredients}` : ""}
${note ? `Extra note: ${note}` : ""}`;

  const result = await geminiChat([{ text: prompt }, dataUrlToInlinePart(fileDataUrl)]);

  return result ?? {
    name: "Food item",
    quantity: quantity || "1 serving",
    confidence: 0.5,
    recognizedFoods: [],
    ingredientsUsed: ingredients ? ingredients.split(",").map((i) => i.trim()).filter(Boolean) : [],
    nutrients: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 },
    notes: "Add GEMINI_API_KEY to enable visual food recognition.",
  };
}

export async function analyzeActivity({
  fileDataUrl,
  stepCount,
  weightKg,
  durationMinutes,
}: {
  fileDataUrl?: string;
  stepCount?: number;
  weightKg: number;
  durationMinutes?: number;
}) {
  const prompt = `You analyze activity screenshots for a health tracker.
Read the step count, infer activity type, estimate calories burned, and report confidence.
Return JSON with:
{
  "stepCount": number,
  "activityType": string,
  "durationMinutes": number | null,
  "avgCalBurn": number,
  "confidence": number,
  "notes": string
}
Use weight ${weightKg} kg.
${stepCount ? `User provided step count: ${stepCount}` : ""}
${durationMinutes ? `Duration minutes: ${durationMinutes}` : ""}`;

  if (!env.geminiApiKey) {
    const manual = stepCount ?? 0;
    return {
      stepCount: manual,
      activityType: "walking",
      durationMinutes: durationMinutes ?? null,
      avgCalBurn: Math.round(manual * Math.max(0.02, Math.min(0.06, weightKg / 1500))),
      confidence: manual ? 0.72 : 0.4,
      notes: "Add GEMINI_API_KEY to enable screenshot reading.",
    };
  }

  const parts: GeminiPart[] = [{ text: prompt }];
  if (fileDataUrl) parts.push(dataUrlToInlinePart(fileDataUrl));

  const result = await geminiChat(parts);
  return result ?? {
    stepCount: stepCount ?? 0,
    activityType: "walking",
    durationMinutes: durationMinutes ?? null,
    avgCalBurn: Math.round((stepCount ?? 0) * 0.04),
    confidence: 0.4,
    notes: "Unable to analyze the activity image.",
  };
}
