import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

const geminiApiKey = (
  import.meta as ImportMeta & { env: { VITE_GEMINI_API_KEY?: string } }
).env.VITE_GEMINI_API_KEY?.trim() || "";

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  try { return JSON.parse(candidate); } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    return null;
  }
}

async function analyzeBloodReportFrontend(reportText: string, weightKg: number) {
  if (!geminiApiKey) return null;

  // Strip repeated lab headers/footers and long explanation paragraphs,
  // keep only lines that contain actual test values (short lines with numbers)
  const cleaned = reportText
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t.length === 0) return false;
      if (t.length > 300) return false; // long explanatory paragraphs
      if (/orchard|orangehealth|support@|www\.|download app|rated|available in|trusted by|reports in/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .slice(0, 6000);

  const prompt = `Analyze this blood report. Return ONLY a JSON object (no markdown) with exactly these keys:
{"summary":"string","keyFindings":["string"],"flags":["string"],"suggestedTargets":{"calories":0,"proteinG":0,"carbsG":0,"fatG":0,"fiberG":0,"sugarG":0,"sodiumMg":0},"profileHints":{"gender":"string","age":null,"activityLevel":"string","goal":"string","healthConditions":[],"dietaryPreferences":[]}}
Patient weight: ${weightKg}kg. Report:\n${cleaned}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return extractJson(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function estimateMealNutrition(name: string, quantity: string): Promise<NutrientBreakdown | null> {
  if (!geminiApiKey || !name.trim()) return null;
  const prompt = `You are a precise nutrition database. Given a food item, return its exact nutritional values.

Rules:
- For branded/packaged products (Amul, Nestlé, Britannia, etc.) use the EXACT values printed on the package label, scaled to the given quantity.
- For homemade/restaurant dishes use standard Indian recipe values.
- Scale all values proportionally to the given quantity.
- Return ONLY a JSON object, no markdown, no explanation.

Food: "${name.trim()}"
Quantity: "${quantity.trim() || "1 serving"}"

Return exactly:
{"calories":0,"proteinG":0,"carbsG":0,"fatG":0,"fiberG":0,"sugarG":0,"sodiumMg":0}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`,
      { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = extractJson(text);
    if (!parsed || typeof parsed.calories !== "number") return null;
    return {
      calories: Math.round(parsed.calories ?? 0),
      proteinG: Math.round((parsed.proteinG ?? 0) * 10) / 10,
      carbsG: Math.round((parsed.carbsG ?? 0) * 10) / 10,
      fatG: Math.round((parsed.fatG ?? 0) * 10) / 10,
      fiberG: Math.round((parsed.fiberG ?? 0) * 10) / 10,
      sugarG: Math.round((parsed.sugarG ?? 0) * 10) / 10,
      sodiumMg: Math.round(parsed.sodiumMg ?? 0),
    };
  } catch { return null; } finally { clearTimeout(timer); }
}

async function extractPdfText(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, i) =>
      pdf.getPage(i + 1).then((p) => p.getTextContent()).then((c) =>
        c.items.map((it) => ("str" in it ? it.str : "")).join(" ")
      )
    )
  );
  return pages.join("\n").slice(0, 12000);
}
import type {
  ActivityLevel,
  DietaryPreference,
  DailySummary,
  FoodEntry,
  Gender,
  Goal,
  HealthCondition,
  NutrientBreakdown,
  UserProfile,
} from "@nutrition/shared";

const apiBaseUrl = (
  import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }
).env.VITE_API_BASE_URL?.trim() || "http://localhost:4000";

const today = () => new Date().toISOString().slice(0, 10);

const genderOptions: Gender[] = ["female", "male", "non_binary", "prefer_not_to_say"];
const activityOptions: ActivityLevel[] = ["sedentary", "light", "moderate", "active", "very_active"];
const goalOptions: Goal[] = ["weight_loss", "muscle_gain", "maintenance"];
const conditionOptions: HealthCondition[] = [
  "diabetes",
  "thyroid",
  "hypertension",
  "pcos",
  "high_cholesterol",
  "none",
  "other",
];
const preferenceOptions: DietaryPreference[] = [
  "vegetarian",
  "vegan",
  "eggetarian",
  "keto",
  "high_protein",
  "low_carb",
  "halal",
  "jain",
  "none",
];
const mealSources = ["manual", "photo", "barcode"] as const;

type SummaryResponse = DailySummary & {
  meals: FoodEntry[];
  goalAchievementPercentage: number;
  activityBurn?: number;
};


type AssessmentResult = UserProfile & {
  userId: string;
  targetCalories: number;
  macroTargets: NutrientBreakdown;
  profileSource?: string;
  bloodReportAnalysis?: unknown;
};

type AssessmentFormState = UserProfile & { userId: string };

type MealFormState = {
  userId: string;
  name: string;
  source: (typeof mealSources)[number];
  quantity: string;
  eatenAt: string;
  nutrients: NutrientBreakdown;
};

type FoodAnalysisResult = {
  name: string;
  quantity: string;
  confidence: number;
  recognizedFoods: string[];
  ingredientsUsed: string[];
  nutrients: NutrientBreakdown;
  notes: string;
};

type BloodAnalysisResult = {
  summary: string;
  keyFindings: string[];
  flags: string[];
  suggestedTargets?: NutrientBreakdown | null;
  profileHints?: Partial<UserProfile>;
  rawText?: string;
};

type ActivityAnalysisResult = {
  stepCount: number;
  activityType: string;
  durationMinutes: number | null;
  avgCalBurn: number;
  confidence: number;
  notes: string;
};

type AuthSession = { userId: string; name: string; token: string };
type AuthView = "login" | "register" | "forgot" | "reset";

const nutrientDefaults: NutrientBreakdown = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
};

const assessmentDefaults = (userId: string): AssessmentFormState => ({
  userId,
  age: 28,
  heightCm: 170,
  weightKg: 68,
  gender: "prefer_not_to_say",
  activityLevel: "moderate",
  goal: "maintenance",
  healthConditions: ["none"],
  allergies: ["none"],
  dietaryPreferences: ["none"],
});

const mealDefaults = (userId: string): MealFormState => ({
  userId,
  name: "",
  source: "manual",
  quantity: "",
  eatenAt: toDateTimeLocalValue(new Date().toISOString()),
  nutrients: { ...nutrientDefaults },
});

function normalizeSummary(s: SummaryResponse): SummaryResponse {
  return {
    ...s,
    meals: s.meals.map((m) => {
      const raw = m as FoodEntry & { _id?: string };
      return { ...m, id: m.id || raw._id || "" };
    }),
  };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function toggleValue<T>(values: T[], next: T): T[] {
  return values.includes(next) ? values.filter((item) => item !== next) : [...values, next];
}

function formatNumber(value: number, suffix = "") {
  return `${Math.round(value)}${suffix}`;
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function readFileAsDataUrl(file: File) {
  return new Promise<{ dataUrl: string; fileName: string; fileType: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        dataUrl: String(reader.result ?? ""),
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
      });
    };
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

async function handleFileSelection(
  file: File | undefined,
  onLoaded: (value: { dataUrl: string; fileName: string; fileType: string }) => void,
) {
  if (!file) {
    onLoaded({ dataUrl: "", fileName: "", fileType: "" });
    return;
  }

  onLoaded(await readFileAsDataUrl(file));
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthSession | null>(() => {
    try {
      const saved = window.localStorage.getItem("nutrition:auth");
      return saved ? (JSON.parse(saved) as AuthSession) : null;
    } catch {
      return null;
    }
  });
  const userId = currentUser?.userId ?? "";
  const [selectedDate, setSelectedDate] = useState(today());
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [assessmentForm, setAssessmentForm] = useState<AssessmentFormState>(() => assessmentDefaults(userId));
  const [mealForm, setMealForm] = useState<MealFormState>(() => mealDefaults(userId));
  const [bloodReportFileName, setBloodReportFileName] = useState("");
  const [bloodReportFileType, setBloodReportFileType] = useState("");
  const [bloodReportDataUrl, setBloodReportDataUrl] = useState("");
  const [bloodAnalysis, setBloodAnalysis] = useState<BloodAnalysisResult | null>(null);
  const [mealPhotoFileName, setMealPhotoFileName] = useState("");
  const [mealPhotoFileType, setMealPhotoFileType] = useState("");
  const [mealPhotoDataUrl, setMealPhotoDataUrl] = useState("");
  const [mealIngredients, setMealIngredients] = useState("");
  const [foodAnalysis, setFoodAnalysis] = useState<FoodAnalysisResult | null>(null);
  const [activityFileName, setActivityFileName] = useState("");
  const [activityFileType, setActivityFileType] = useState("");
  const [activityDataUrl, setActivityDataUrl] = useState("");
  const [activityStepCount, setActivityStepCount] = useState("");
  const [activityDuration, setActivityDuration] = useState("");
  const [activityAnalysis, setActivityAnalysis] = useState<ActivityAnalysisResult | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("+917037449337");
  const [whatsappStatusMessage, setWhatsappStatusMessage] = useState("");
  const [busy, setBusy] = useState({
    assessment: false,
    meal: false,
    summary: false,
    blood: false,
    food: false,
    activity: false,
    whatsapp: false,
    estimate: false,
  });
  const [error, setError] = useState("");
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", quantity: "", calories: "", proteinG: "", carbsG: "", fatG: "" });

  const [authView, setAuthView] = useState<AuthView>("login");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [authForm, setAuthForm] = useState({
    name: "",
    phone: "",
    dob: "",
    weightKg: "",
    password: "",
    confirmPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });

  useEffect(() => {
    setAssessmentForm((current) => ({ ...current, userId }));
    setMealForm((current) => ({ ...current, userId }));
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const [savedAssessment, latestSummary] = await Promise.all([
          apiRequest<AssessmentResult | null>(`/api/health/assessment/${userId}`).catch(() => null),
          apiRequest<SummaryResponse>(`/api/summary/${selectedDate}?userId=${encodeURIComponent(userId)}`).catch(
            () => null,
          ),
        ]);

        if (!mounted) {
          return;
        }

        if (savedAssessment) {
          setAssessment(savedAssessment);
          setAssessmentForm({
            userId,
            age: savedAssessment.age,
            heightCm: savedAssessment.heightCm,
            weightKg: 0,
            gender: savedAssessment.gender,
            activityLevel: savedAssessment.activityLevel,
            goal: savedAssessment.goal,
            healthConditions: savedAssessment.healthConditions,
            allergies: savedAssessment.allergies,
            dietaryPreferences: savedAssessment.dietaryPreferences,
          });
        }

        if (latestSummary) {
          setSummary(normalizeSummary(latestSummary));
        }
      } catch (caughtError) {
        if (!mounted) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "Failed to load app data");
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [selectedDate, userId]);

  const healthScore = summary?.score ?? 0;
  const completion = summary?.goalAchievementPercentage ?? 0;
  const remainingCalories = summary?.remaining.calories ?? assessment?.targetCalories ?? 0;

  const recommendations = useMemo(() => {
    if (!summary) {
      return [
        "Complete your assessment to generate daily targets.",
        "Log a meal to see nutrition gaps appear here.",
        "Upload a blood report to auto-build your profile.",
      ];
    }

    const items: string[] = [];

    if (summary.remaining.proteinG > 20) {
      items.push("Add a protein-rich snack like Greek yogurt, paneer, or tofu.");
    }

    if (summary.remaining.fiberG > 6) {
      items.push("Increase fiber with vegetables, berries, beans, or chia seeds.");
    }

    if (summary.consumed.sodiumMg > summary.targets.sodiumMg) {
      items.push("Reduce sodium tomorrow by skipping packaged and restaurant foods.");
    }

    if (summary.remaining.calories > 300) {
      items.push("You still have room for a balanced dinner or post-workout meal.");
    }

    if (summary.consumed.sugarG > summary.targets.sugarG) {
      items.push("Swap sugary snacks for fruit, nuts, or a yogurt bowl.");
    }

    return items.length
      ? items
      : ["Your day is balanced so far. Keep the same pattern tomorrow."];
  }, [summary]);

  const whatsappPreview = useMemo(() => {
    if (!summary) {
      return "Your WhatsApp summary will appear after you log meals and generate a daily report.";
    }

    const mealNames = summary.meals.map((meal) => meal.name).join(", ") || "No meals logged";

    return [
      `Meals: ${mealNames}`,
      `Calories: ${Math.round(summary.consumed.calories)} / ${Math.round(summary.targets.calories)}`,
      `Protein: ${Math.round(summary.consumed.proteinG)}g, Carbs: ${Math.round(summary.consumed.carbsG)}g, Fat: ${Math.round(summary.consumed.fatG)}g`,
      `Activity burn: ${Math.round(summary.activityBurn ?? 0)} kcal`,
      `Score: ${summary.score}/100`,
      `Goal achievement: ${summary.goalAchievementPercentage}%`,
      `Tomorrow: ${recommendations[0] ?? "Keep going."}`,
    ].join("\n");
  }, [recommendations, summary]);

  const handleAssessmentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, assessment: true }));
    setError("");

    try {
      const isPdf = bloodReportDataUrl?.startsWith("data:application/pdf") ||
        bloodReportFileName.toLowerCase().endsWith(".pdf");
      const reportText = bloodReportDataUrl && isPdf
        ? await extractPdfText(bloodReportDataUrl)
        : undefined;

      const precomputedAnalysis = reportText
        ? await analyzeBloodReportFrontend(reportText, assessmentForm.weightKg)
        : null;

      const saved = bloodReportDataUrl
        ? await apiRequest<{ assessment: AssessmentResult; analysis: BloodAnalysisResult }>("/api/reports/blood", {
              method: "POST",
              body: JSON.stringify({
                userId,
                weightKg: assessmentForm.weightKg,
                fileDataUrl: isPdf ? undefined : bloodReportDataUrl,
                reportText,
                analysis: precomputedAnalysis,
                fileName: bloodReportFileName,
                fileType: bloodReportFileType || (bloodReportFileName.endsWith(".pdf") ? "application/pdf" : "image/*"),
                manualProfile: assessmentForm,
              }),
            })
        : {
            assessment: await apiRequest<AssessmentResult>("/api/health/assessment", {
              method: "POST",
              body: JSON.stringify(assessmentForm),
            }),
            analysis: null,
      };

      setAssessment(saved.assessment);
      setBloodAnalysis(saved.analysis);
      setAssessmentForm({
        userId,
        age: saved.assessment.age,
        heightCm: saved.assessment.heightCm,
        weightKg: 0,
        gender: saved.assessment.gender,
        activityLevel: saved.assessment.activityLevel,
        goal: saved.assessment.goal,
        healthConditions: saved.assessment.healthConditions,
        allergies: saved.assessment.allergies,
        dietaryPreferences: saved.assessment.dietaryPreferences,
      });
      await refreshSummary();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save assessment");
    } finally {
      setBusy((current) => ({ ...current, assessment: false }));
    }
  };

  const handleMealSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, meal: true }));
    setError("");

    try {
      if (mealPhotoDataUrl) {
        const result = await apiRequest<{ item: FoodEntry; analysis: FoodAnalysisResult }>("/api/meals/analyze", {
          method: "POST",
          body: JSON.stringify({
            userId,
            fileDataUrl: mealPhotoDataUrl,
            quantity: mealForm.quantity,
            ingredients: mealIngredients,
            note: mealForm.name,
            eatenAt: new Date(mealForm.eatenAt).toISOString(),
          }),
        });
        setFoodAnalysis(result.analysis);
      } else {
        await apiRequest<{ item: FoodEntry }>("/api/meals", {
          method: "POST",
          body: JSON.stringify({
            ...mealForm,
            eatenAt: new Date(mealForm.eatenAt).toISOString(),
          }),
        });
      }

      setMealForm((current) => ({
        ...current,
        eatenAt: toDateTimeLocalValue(new Date().toISOString()),
      }));
      setMealPhotoDataUrl("");
      setMealPhotoFileName("");
      setMealPhotoFileType("");
      setMealIngredients("");
      await refreshSummary();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to log meal");
    } finally {
      setBusy((current) => ({ ...current, meal: false }));
    }
  };

  const handleActivitySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, activity: true }));
    setError("");

    try {
      const result = await apiRequest<{ item: { avgCalBurn: number; stepCount: number }; analysis: ActivityAnalysisResult }>(
        "/api/activities/analyze",
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            weightKg: assessment?.weightKg ?? assessmentForm.weightKg,
            stepCount: activityStepCount ? Number(activityStepCount) : undefined,
            durationMinutes: activityDuration ? Number(activityDuration) : undefined,
            fileDataUrl: activityDataUrl || undefined,
            fileName: activityFileName,
          }),
        },
      );

      setActivityAnalysis(result.analysis);
      setActivityDataUrl("");
      setActivityFileName("");
      await refreshSummary();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to analyze activity");
    } finally {
      setBusy((current) => ({ ...current, activity: false }));
    }
  };

  const handleWhatsappSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, whatsapp: true }));
    setError("");

    try {
      const response = await apiRequest<{ sent: boolean; preview?: string; reason?: string; message?: string }>(
        "/api/whatsapp/daily-summary",
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            date: selectedDate,
            to: whatsappNumber,
          }),
        },
      );

      setWhatsappStatusMessage(response.sent ? "WhatsApp summary sent." : response.reason ?? "Preview generated only.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to send WhatsApp summary");
    } finally {
      setBusy((current) => ({ ...current, whatsapp: false }));
    }
  };

  async function refreshSummary(nextDate = selectedDate) {
    setBusy((current) => ({ ...current, summary: true }));

    try {
      const latest = await apiRequest<SummaryResponse>(
        `/api/summary/${nextDate}?userId=${encodeURIComponent(userId)}`,
      );
      setSummary(normalizeSummary(latest));
    } catch {
      setSummary(null);
    } finally {
      setBusy((current) => ({ ...current, summary: false }));
    }
  }

  const saveAuth = (session: AuthSession) => {
    window.localStorage.setItem("nutrition:auth", JSON.stringify(session));
    setCurrentUser(session);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const session = await apiRequest<AuthSession>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone: authForm.phone, password: authForm.password }),
      });
      saveAuth(session);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authForm.password !== authForm.confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const session = await apiRequest<AuthSession>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: authForm.name,
          phone: authForm.phone,
          dob: authForm.dob,
          weightKg: Number(authForm.weightKg),
          password: authForm.password,
        }),
      });
      saveAuth(session);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await apiRequest<{ resetToken: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ name: authForm.name, phone: authForm.phone, dob: authForm.dob }),
      });
      setResetToken(result.resetToken);
      setAuthView("reset");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authForm.newPassword !== authForm.confirmNewPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ resetToken, newPassword: authForm.newPassword }),
      });
      setAuthView("login");
      setAuthError("");
      setAuthForm((f) => ({ ...f, newPassword: "", confirmNewPassword: "", password: "" }));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem("nutrition:auth");
    setCurrentUser(null);
    setAuthView("login");
    setAuthForm({ name: "", phone: "", dob: "", weightKg: "", password: "", confirmPassword: "", newPassword: "", confirmNewPassword: "" });
    setAuthError("");
  };

  const openAuth = (view: AuthView) => {
    setAuthView(view);
    setAuthError("");
    setShowAuthModal(true);
  };

  const closeAuth = () => {
    setShowAuthModal(false);
    setAuthError("");
  };

  const quickFillMeal = (name: string, nutrients: NutrientBreakdown, quantity: string) => {
    setMealForm((current) => ({
      ...current,
      name,
      quantity,
      nutrients,
    }));
  };

  const downloadReport = () => {
    if (!summary) return;

    const lines = [
      "NutriCore daily report",
      `User: ${currentUser?.name ?? ""}`,
      `Date: ${selectedDate}`,
      "",
      `Score: ${summary.score}/100`,
      `Goal achievement: ${summary.goalAchievementPercentage}%`,
      `Calories: ${Math.round(summary.consumed.calories)} / ${Math.round(summary.targets.calories)}`,
      `Protein: ${Math.round(summary.consumed.proteinG)}g / ${Math.round(summary.targets.proteinG)}g`,
      `Carbs: ${Math.round(summary.consumed.carbsG)}g / ${Math.round(summary.targets.carbsG)}g`,
      `Fat: ${Math.round(summary.consumed.fatG)}g / ${Math.round(summary.targets.fatG)}g`,
      `Fiber: ${Math.round(summary.consumed.fiberG)}g / ${Math.round(summary.targets.fiberG)}g`,
      `Sodium: ${Math.round(summary.consumed.sodiumMg)}mg / ${Math.round(summary.targets.sodiumMg)}mg`,
      `Activity burn: ${Math.round(summary.activityBurn ?? 0)} kcal`,
      "",
      "Meals:",
      ...(summary.meals.length
        ? summary.meals.map(
            (meal) =>
              `- ${meal.name} (${meal.quantity}): ${Math.round(meal.nutrients.calories)} kcal, P${Math.round(meal.nutrients.proteinG)}g C${Math.round(meal.nutrients.carbsG)}g F${Math.round(meal.nutrients.fatG)}g`,
          )
        : ["No meals logged."]),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nutricore-report-${selectedDate}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!currentUser) {
    return (
      <>
        <Landing onGetStarted={() => openAuth("register")} onLogin={() => openAuth("login")} />
        {showAuthModal && (
        <div
          className="auth-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAuth();
          }}
        >
          <div className="auth-card">
            <div className="auth-brand">
              <div className="brand-mark">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3C12 3 20 7 20 13C20 18 16 21 12 21C8 21 4 18 4 13C4 7 12 3 12 3Z" fill="white" fillOpacity="0.95"/>
              <path d="M12 21V9" stroke="#EB6429" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M12 14L8.5 10.5" stroke="#EB6429" strokeOpacity="0.4" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M12 17L15.5 13.5" stroke="#EB6429" strokeOpacity="0.4" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
              <strong>NutriCore</strong>
              <button type="button" className="auth-close-btn" onClick={closeAuth} aria-label="Close">
                ✕
              </button>
            </div>

            {authView === "login" && (
              <form className="auth-form" onSubmit={handleLogin}>
                <h2>Welcome back</h2>
                <p className="auth-sub">Log in to your account</p>

                <label className="field">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    placeholder="+91xxxxxxxxxx"
                    value={authForm.phone}
                    onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    placeholder="Enter your password"
                    value={authForm.password}
                    onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
                    required
                  />
                </label>

                {authError && <p className="auth-error">{authError}</p>}

                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Logging in..." : "Log In"}
                </button>

                <div className="auth-links">
                  <button type="button" className="auth-text-btn" onClick={() => openAuth("forgot")}>
                    Forgot password?
                  </button>
                  <span>·</span>
                  <button type="button" className="auth-text-btn" onClick={() => openAuth("register")}>
                    Create account
                  </button>
                </div>
              </form>
            )}

            {authView === "register" && (
              <form className="auth-form" onSubmit={handleRegister}>
                <h2>Create account</h2>
                <p className="auth-sub">Start your nutrition journey</p>

                <label className="field">
                  <span>Full name</span>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={authForm.name}
                    onChange={(e) => setAuthForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    placeholder="+91xxxxxxxxxx"
                    value={authForm.phone}
                    onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Date of birth</span>
                  <input
                    type="date"
                    value={authForm.dob}
                    onChange={(e) => setAuthForm((f) => ({ ...f, dob: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Weight (kg)</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 68"
                    value={authForm.weightKg}
                    onChange={(e) => setAuthForm((f) => ({ ...f, weightKg: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    placeholder="Create a password"
                    value={authForm.password}
                    onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Confirm password</span>
                  <input
                    type="password"
                    placeholder="Repeat password"
                    value={authForm.confirmPassword}
                    onChange={(e) => setAuthForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    required
                  />
                </label>

                {authError && <p className="auth-error">{authError}</p>}

                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Creating account..." : "Create Account"}
                </button>

                <div className="auth-links">
                  <button type="button" className="auth-text-btn" onClick={() => openAuth("login")}>
                    Already have an account? Log in
                  </button>
                </div>
              </form>
            )}

            {authView === "forgot" && (
              <form className="auth-form" onSubmit={handleForgot}>
                <h2>Reset password</h2>
                <p className="auth-sub">Verify your identity to continue</p>

                <label className="field">
                  <span>Full name</span>
                  <input
                    type="text"
                    placeholder="Name on your account"
                    value={authForm.name}
                    onChange={(e) => setAuthForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    placeholder="+91xxxxxxxxxx"
                    value={authForm.phone}
                    onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Date of birth</span>
                  <input
                    type="date"
                    value={authForm.dob}
                    onChange={(e) => setAuthForm((f) => ({ ...f, dob: e.target.value }))}
                    required
                  />
                </label>

                {authError && <p className="auth-error">{authError}</p>}

                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Verifying..." : "Verify Identity"}
                </button>

                <div className="auth-links">
                  <button type="button" className="auth-text-btn" onClick={() => openAuth("login")}>
                    Back to login
                  </button>
                </div>
              </form>
            )}

            {authView === "reset" && (
              <form className="auth-form" onSubmit={handleReset}>
                <h2>New password</h2>
                <p className="auth-sub">Identity verified. Set your new password.</p>

                <label className="field">
                  <span>New password</span>
                  <input
                    type="password"
                    placeholder="Create a new password"
                    value={authForm.newPassword}
                    onChange={(e) => setAuthForm((f) => ({ ...f, newPassword: e.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    placeholder="Repeat new password"
                    value={authForm.confirmNewPassword}
                    onChange={(e) => setAuthForm((f) => ({ ...f, confirmNewPassword: e.target.value }))}
                    required
                  />
                </label>

                {authError && <p className="auth-error">{authError}</p>}

                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Resetting..." : "Reset Password"}
                </button>
              </form>
            )}
          </div>
        </div>
        )}
      </>
    );
  }

  const scoreState = healthScore >= 75 ? "good" : "warn";
  const goalState = completion >= 75 ? "good" : "warn";
  const initials = currentUser.name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 3C12 3 20 7 20 13C20 18 16 21 12 21C8 21 4 18 4 13C4 7 12 3 12 3Z" fill="white" />
            </svg>
          </div>
          <div>
            <strong>NutriCore</strong>
            <span>Dashboard</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
            Dashboard
          </button>
          <button type="button" onClick={() => document.getElementById("meal")?.scrollIntoView({ behavior: "smooth" })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 3v18M4 3c4 0 4 3 4 5s0 5-4 5M20 3v18"/></svg>
            Log a meal
          </button>
          <button type="button" onClick={() => document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"/></svg>
            Activity
          </button>
          <button type="button" onClick={() => document.getElementById("assessment")?.scrollIntoView({ behavior: "smooth" })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 14c0-3 4-4 8-4s8 1 8 4M12 3a4 4 0 100 8 4 4 0 000-8z"/></svg>
            Health assessment
          </button>
          <button type="button" onClick={() => document.getElementById("whatsapp")?.scrollIntoView({ behavior: "smooth" })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.4 8.4 0 01-8.8 8.4A8.5 8.5 0 014 12a8.4 8.4 0 0114.5-5.8L21 4v5.5h-5.3"/></svg>
            Daily digest
          </button>
          <button type="button" onClick={() => document.getElementById("report")?.scrollIntoView({ behavior: "smooth" })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h9l5 5v13H6z"/><path d="M9 12h6M9 16h6M9 8h3"/></svg>
            Reports
          </button>
        </nav>

        <div className="sidebar-foot">
          <div className="avatar">{initials}</div>
          <div className="who">
            <strong>{currentUser.name}</strong>
            <button type="button" className="logout-link" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <div className="topbar">
          <div>
            <p className="eyebrow">Daily report</p>
            <h1>Welcome back, {currentUser.name.split(" ")[0]}.</h1>
          </div>
          <div className="topbar-actions">
            <span className="date-pill">
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </span>
            <button type="button" className="secondary compact" onClick={() => void refreshSummary()} disabled={busy.summary}>
              {busy.summary ? "Refreshing..." : "Refresh report"}
            </button>
          </div>
        </div>

        <section className="hero-row">
          <div className="dashboard-card ring-card">
            <CalorieRing
              value={summary?.consumed.calories ?? 0}
              max={summary?.targets.calories ?? assessment?.targetCalories ?? 2000}
            />
            <div className="ring-legend">
              <p className="card-kicker" style={{ marginBottom: "0.4rem" }}>Calories today</p>
              <div className="row"><span>Consumed</span><strong>{Math.round(summary?.consumed.calories ?? 0)}</strong></div>
              <div className="row"><span>Remaining</span><strong>{Math.round(remainingCalories)}</strong></div>
              <div className="row"><span>Target</span><strong>{Math.round(summary?.targets.calories ?? assessment?.targetCalories ?? 0)}</strong></div>
            </div>
          </div>

          <div className="dashboard-card score-tile">
            <p className="card-kicker">Nutritional score</p>
            <div className="score-num-row"><strong>{healthScore}</strong><span>/ 100</span></div>
            <span className={`pill ${scoreState}`}>
              <span className="dot" />
              {healthScore >= 75 ? "On track today" : healthScore >= 50 ? "Needs a bit more balance" : "Off track today"}
            </span>
          </div>

          <div className="dashboard-card goal-tile">
            <p className="card-kicker">Goal achievement</p>
            <ProgressBar label="Today" value={completion} max={100} suffix="%" />
            <span className={`pill ${goalState}`}>
              <span className="dot" />
              {completion >= 75 ? "Great progress today" : "Keep building through the day"}
            </span>
          </div>
        </section>

        <section className="macro-grid">
          <MacroBar label="Protein" color="var(--protein)" consumed={summary?.consumed.proteinG ?? 0} target={summary?.targets.proteinG ?? assessment?.macroTargets.proteinG ?? 0} unit="g" />
          <MacroBar label="Carbs" color="var(--carbs)" consumed={summary?.consumed.carbsG ?? 0} target={summary?.targets.carbsG ?? assessment?.macroTargets.carbsG ?? 0} unit="g" />
          <MacroBar label="Fat" color="var(--fat)" consumed={summary?.consumed.fatG ?? 0} target={summary?.targets.fatG ?? assessment?.macroTargets.fatG ?? 0} unit="g" />
          <MacroBar label="Fiber" color="var(--fiber)" consumed={summary?.consumed.fiberG ?? 0} target={summary?.targets.fiberG ?? assessment?.macroTargets.fiberG ?? 0} unit="g" />
          <MacroBar label="Sodium" color="var(--sodium)" consumed={summary?.consumed.sodiumMg ?? 0} target={summary?.targets.sodiumMg ?? assessment?.macroTargets.sodiumMg ?? 0} unit="mg" />
        </section>

        <section className="dashboard-card">
          <h2>Smart recommendations</h2>
          <ul className="tip-list">
            {recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="body-grid">
        <form id="assessment" className="dashboard-card form-card" onSubmit={handleAssessmentSubmit}>
          <div className="card-header">
            <div>
              <p className="card-kicker">Step 1</p>
              <h2>Health assessment</h2>
            </div>
            <span className="score-badge">Profile setup</span>
          </div>

          <div className="upload-box">
            <label className="field">
              <span>Blood report upload</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setBloodReportFileName("");
                      setBloodReportFileType("");
                      setBloodReportDataUrl("");
                      return;
                    }

                    const loaded = await readFileAsDataUrl(file);
                    setBloodReportFileName(loaded.fileName);
                    setBloodReportFileType(loaded.fileType);
                    setBloodReportDataUrl(loaded.dataUrl);
                  }}
                />
            </label>
            <div className="helper-copy">
              <strong>{bloodReportFileName || "No report uploaded"}</strong>
              <span>
                Upload a blood report to let AI read it, or skip this step and create the profile
                manually using the fields below.
              </span>
            </div>
          </div>

          <div className="form-grid two-col">
            <label className="field">
              <span>Age</span>
              <input
                type="number"
                min="1"
                value={assessmentForm.age}
                onChange={(event) => setAssessmentForm((current) => ({ ...current, age: Number(event.target.value) }))}
              />
            </label>
            <label className="field">
              <span>Gender</span>
              <select
                value={assessmentForm.gender}
                onChange={(event) => setAssessmentForm((current) => ({ ...current, gender: event.target.value as Gender }))}
              >
                {genderOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Height (cm)</span>
              <input
                type="number"
                min="1"
                value={assessmentForm.heightCm}
                onChange={(event) =>
                  setAssessmentForm((current) => ({ ...current, heightCm: Number(event.target.value) }))
                }
              />
            </label>
            <label className="field">
              <span>Weight (kg)</span>
              <input
                type="number"
                min="1"
                value={assessmentForm.weightKg}
                onChange={(event) =>
                  setAssessmentForm((current) => ({ ...current, weightKg: Number(event.target.value) }))
                }
              />
            </label>
            <label className="field">
              <span>Activity level</span>
              <select
                value={assessmentForm.activityLevel}
                onChange={(event) =>
                  setAssessmentForm((current) => ({
                    ...current,
                    activityLevel: event.target.value as ActivityLevel,
                  }))
                }
              >
                {activityOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Fitness goal</span>
              <select
                value={assessmentForm.goal}
                onChange={(event) => setAssessmentForm((current) => ({ ...current, goal: event.target.value as Goal }))}
              >
                {goalOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="upload-box compact-box">
            <div className="helper-copy">
              <strong>Weight is the anchor</strong>
              <span>When you upload a report, AI uses your weight to complete the profile.</span>
            </div>
          </div>

          <section className="field-group">
            <span>Health conditions</span>
            <div className="chip-grid">
              {conditionOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip ${assessmentForm.healthConditions.includes(option) ? "active" : ""}`}
                  onClick={() =>
                    setAssessmentForm((current) => ({
                      ...current,
                      healthConditions: toggleValue(current.healthConditions, option),
                    }))
                  }
                >
                  {formatLabel(option)}
                </button>
              ))}
            </div>
          </section>

          <div className="form-grid two-col">
            <label className="field">
              <span>Allergies</span>
              <input
                value={assessmentForm.allergies.join(", ")}
                onChange={(event) =>
                  setAssessmentForm((current) => ({
                    ...current,
                    allergies: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="milk, peanuts, soy"
              />
            </label>
            <label className="field">
              <span>Dietary preferences</span>
              <input
                value={assessmentForm.dietaryPreferences.join(", ")}
                onChange={(event) =>
                  setAssessmentForm((current) => ({
                    ...current,
                    dietaryPreferences: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean) as DietaryPreference[],
                  }))
                }
                placeholder="vegetarian, high_protein"
              />
            </label>
          </div>

          <section className="field-group">
            <span>Quick preferences</span>
            <div className="chip-grid">
              {preferenceOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip ${assessmentForm.dietaryPreferences.includes(option) ? "active" : ""}`}
                  onClick={() =>
                    setAssessmentForm((current) => ({
                      ...current,
                      dietaryPreferences: toggleValue(current.dietaryPreferences, option),
                    }))
                  }
                >
                  {formatLabel(option)}
                </button>
              ))}
            </div>
          </section>

          <div className="form-footer">
            <div className="helper-copy">
              <strong>
                Target calories: {assessment?.targetCalories ? formatNumber(assessment.targetCalories, " kcal") : "not saved yet"}
              </strong>
              <span>
                {assessment?.macroTargets
                  ? `Protein ${assessment.macroTargets.proteinG}g · Carbs ${assessment.macroTargets.carbsG}g · Fat ${assessment.macroTargets.fatG}g`
                  : "Save your profile to calculate daily nutrition targets."}
              </span>
            </div>
            <button type="submit" disabled={busy.assessment}>
              {busy.assessment ? "Analyzing..." : bloodReportDataUrl ? "Analyze report & create profile" : "Save manual profile"}
            </button>
          </div>

          {bloodAnalysis ? (
            <div className="analysis-card">
              <strong>{bloodAnalysis.summary}</strong>
              <div className="analysis-pills">
                {(bloodAnalysis.keyFindings ?? []).slice(0, 4).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              {(bloodAnalysis.flags ?? []).length ? (
                <span className="analysis-note">Flags: {bloodAnalysis.flags.join(", ")}</span>
              ) : null}
            </div>
          ) : null}
        </form>

        <section className="dashboard-card form-card" id="meal">
          <div className="card-header">
            <div>
              <p className="card-kicker">Step 2</p>
              <h2>Log a meal</h2>
            </div>
            <span className="score-badge">Photo first</span>
          </div>

          <form className="stack" onSubmit={handleMealSubmit}>
            <div className="upload-box">
              <label className="field">
                <span>Food photo upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setMealPhotoDataUrl("");
                      setMealPhotoFileName("");
                      setMealPhotoFileType("");
                      return;
                    }

                    const loaded = await readFileAsDataUrl(file);
                    setMealPhotoDataUrl(loaded.dataUrl);
                    setMealPhotoFileName(loaded.fileName);
                    setMealPhotoFileType(loaded.fileType);
                  }}
                />
              </label>
              <div className="helper-copy">
                <strong>{mealPhotoFileName || "No photo uploaded"}</strong>
                <span>
                  Upload the meal photo and AI will estimate the food, portion, and nutrition.
                  Quantity and ingredients are optional.
                </span>
              </div>
            </div>

            <div className="form-grid two-col">
              <label className="field">
                <span>Meal name</span>
                <input
                  value={mealForm.name}
                  onChange={(event) => setMealForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. rice bowl, dal chawal"
                />
              </label>
              <label className="field">
                <span>Quantity</span>
                <input
                  value={mealForm.quantity}
                  onChange={(event) => setMealForm((current) => ({ ...current, quantity: event.target.value }))}
                  placeholder="1 bowl, 2 slices, 180g"
                />
              </label>
            </div>

            <div className="estimate-row">
              <button
                type="button"
                className="estimate-btn"
                disabled={busy.estimate || !mealForm.name.trim()}
                onClick={async () => {
                  setBusy((b) => ({ ...b, estimate: true }));
                  const nutrients = await estimateMealNutrition(mealForm.name, mealForm.quantity);
                  setBusy((b) => ({ ...b, estimate: false }));
                  if (nutrients) {
                    setMealForm((current) => ({ ...current, nutrients }));
                  }
                }}
              >
                {busy.estimate ? "Estimating…" : "✦ Estimate nutrition with AI"}
              </button>
              {!geminiApiKey && <span className="estimate-hint">AI key not configured</span>}
            </div>

            <div className="form-grid two-col">
              <label className="field">
                <span>Ingredients (optional)</span>
                <input
                  value={mealIngredients}
                  onChange={(event) => setMealIngredients(event.target.value)}
                  placeholder="oats, milk, berries"
                />
              </label>
            </div>

            <details className="optional-details">
              <summary>Manual override options</summary>
              <div className="form-grid two-col">
                <label className="field">
                  <span>Meal source</span>
                  <select
                    value={mealForm.source}
                    onChange={(event) =>
                      setMealForm((current) => ({ ...current, source: event.target.value as MealFormState["source"] }))
                    }
                  >
                    {mealSources.map((option) => (
                      <option key={option} value={option}>
                        {formatLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Eaten at</span>
                  <input
                    type="datetime-local"
                    value={mealForm.eatenAt}
                    onChange={(event) => setMealForm((current) => ({ ...current, eatenAt: event.target.value }))}
                  />
                </label>
              </div>

              <section className="nutrient-grid">
                {(["calories", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg"] as const).map((key) => (
                  <label className="field nutrient-field" key={key}>
                    <span>{formatLabel(key)}</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={mealForm.nutrients[key]}
                      onChange={(event) =>
                        setMealForm((current) => ({
                          ...current,
                          nutrients: {
                            ...current.nutrients,
                            [key]: Number(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                ))}
              </section>
            </details>

            <div className="form-footer">
              <div className="helper-copy">
                <strong>Photo recognition first</strong>
                <span>AI uses the image first and only falls back to manual entries when needed.</span>
              </div>
              <button type="submit" disabled={busy.meal}>
                {busy.meal ? "Analyzing..." : mealPhotoDataUrl ? "Analyze & save" : "Save manual meal"}
              </button>
            </div>

            {foodAnalysis ? (
              <div className="analysis-card">
                <strong>{foodAnalysis.name}</strong>
                <span>{foodAnalysis.notes}</span>
                <div className="analysis-pills">
                  <span>{foodAnalysis.nutrients.calories} kcal</span>
                  <span>P {foodAnalysis.nutrients.proteinG}g</span>
                  <span>C {foodAnalysis.nutrients.carbsG}g</span>
                  <span>F {foodAnalysis.nutrients.fatG}g</span>
                </div>
              </div>
            ) : null}
          </form>
        </section>

        <section className="dashboard-card form-card" id="activity">
          <div className="card-header">
            <div>
              <p className="card-kicker">Step 3</p>
              <h2>Activity and step count</h2>
            </div>
            <span className="score-badge score-blue">Burn estimate</span>
          </div>

          <form className="stack" onSubmit={handleActivitySubmit}>
            <div className="upload-box">
              <label className="field">
                <span>Activity screenshot or picture</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setActivityDataUrl("");
                      setActivityFileName("");
                      setActivityFileType("");
                      return;
                    }

                    const loaded = await readFileAsDataUrl(file);
                    setActivityDataUrl(loaded.dataUrl);
                    setActivityFileName(loaded.fileName);
                    setActivityFileType(loaded.fileType);
                  }}
                />
              </label>
              <div className="helper-copy">
                <strong>{activityFileName || "No activity image uploaded"}</strong>
                <span>Upload a step-count screenshot or a picture of your complete activity day.</span>
              </div>
            </div>

            <div className="form-grid two-col">
              <label className="field">
                <span>Step count (optional)</span>
                <input
                  type="number"
                  min="0"
                  value={activityStepCount}
                  onChange={(event) => setActivityStepCount(event.target.value)}
                  placeholder="12500"
                />
              </label>
              <label className="field">
                <span>Duration minutes (optional)</span>
                <input
                  type="number"
                  min="0"
                  value={activityDuration}
                  onChange={(event) => setActivityDuration(event.target.value)}
                  placeholder="60"
                />
              </label>
            </div>

            <div className="form-footer">
              <div className="helper-copy">
                <strong>Step photo or manual count</strong>
                <span>AI can read your screenshot, or you can type the step count directly.</span>
              </div>
              <button type="submit" disabled={busy.activity}>
                {busy.activity ? "Analyzing..." : "Estimate calories burned"}
              </button>
            </div>

            {activityAnalysis ? (
              <div className="analysis-card">
                <strong>{activityAnalysis.activityType}</strong>
                <span>
                  {activityAnalysis.stepCount} steps · {Math.round(activityAnalysis.avgCalBurn)} kcal burned
                </span>
                <span>{activityAnalysis.notes}</span>
              </div>
            ) : null}
          </form>
        </section>

        <section className="dashboard-card form-card" id="whatsapp">
          <div className="card-header">
            <div>
              <p className="card-kicker">Step 4 · via WhatsApp</p>
              <h2>Daily digest</h2>
            </div>
            <span className="score-badge">Send report</span>
          </div>

          <form className="stack" onSubmit={handleWhatsappSubmit}>
            <div className="form-grid two-col">
              <label className="field">
                <span>Recipient number</span>
                <input
                  value={whatsappNumber}
                  onChange={(event) => setWhatsappNumber(event.target.value)}
                  placeholder="+91xxxxxxxxxx"
                />
              </label>
              <label className="field">
                <span>Report date</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
            </div>

            <div className="form-footer">
              <div className="helper-copy">
                <strong>Daily summary message</strong>
                <span>
                  {whatsappStatusMessage ||
                    "Click \"Send WhatsApp summary\" to receive your daily nutrition report on WhatsApp."}
                </span>
              </div>
              <button type="submit" disabled={busy.whatsapp}>
                {busy.whatsapp ? "Sending..." : "Send WhatsApp summary"}
              </button>
            </div>
          </form>
        </section>

        <section id="report" className="dashboard-card form-card full-span">
          <div className="card-header">
            <div>
              <p className="card-kicker">Step 5</p>
              <h2>Daily report</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span className={`score-badge ${completion >= 75 ? "score-good" : "score-warn"}`}>
                {completion}% goal
              </span>
              <button type="button" className="secondary compact" onClick={downloadReport} disabled={!summary}>
                Download report
              </button>
            </div>
          </div>

          {summary ? (
            <div className="report-layout">
              <div className="report-meals">
                <h3>Meals consumed</h3>
                <div className="meal-list">
                  {summary.meals.length ? (
                    summary.meals.map((meal) => (
                      <article key={meal.id} className="meal-card">
                        {editingMealId === meal.id ? (
                          <form
                            className="meal-edit-form"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              await apiRequest(`/api/meals/${meal.id}?userId=${userId}`, {
                                method: "PATCH",
                                body: JSON.stringify({
                                  name: editForm.name,
                                  quantity: editForm.quantity,
                                  nutrients: {
                                    ...meal.nutrients,
                                    calories: Number(editForm.calories),
                                    proteinG: Number(editForm.proteinG),
                                    carbsG: Number(editForm.carbsG),
                                    fatG: Number(editForm.fatG),
                                  },
                                }),
                              });
                              setEditingMealId(null);
                              await refreshSummary();
                            }}
                          >
                            <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" required />
                            <input value={editForm.quantity} onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Quantity" required />
                            <div className="meal-edit-macros">
                              <label>kcal<input type="number" value={editForm.calories} onChange={(e) => setEditForm((f) => ({ ...f, calories: e.target.value }))} min="0" step="any" required /></label>
                              <label>P(g)<input type="number" value={editForm.proteinG} onChange={(e) => setEditForm((f) => ({ ...f, proteinG: e.target.value }))} min="0" step="any" required /></label>
                              <label>C(g)<input type="number" value={editForm.carbsG} onChange={(e) => setEditForm((f) => ({ ...f, carbsG: e.target.value }))} min="0" step="any" required /></label>
                              <label>F(g)<input type="number" value={editForm.fatG} onChange={(e) => setEditForm((f) => ({ ...f, fatG: e.target.value }))} min="0" step="any" required /></label>
                            </div>
                            <div className="meal-edit-actions">
                              <button type="submit" className="compact">Save</button>
                              <button type="button" className="secondary compact" onClick={() => setEditingMealId(null)}>Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div>
                              <strong>{meal.name}</strong>
                              <span>{meal.quantity} · {formatLabel(meal.source)}</span>
                            </div>
                            <div className="meal-values">
                              <span>{meal.nutrients.calories} kcal</span>
                              <span>P {meal.nutrients.proteinG}g</span>
                              <span>C {meal.nutrients.carbsG}g</span>
                              <span>F {meal.nutrients.fatG}g</span>
                              <button
                                className="meal-edit-btn"
                                title="Edit meal"
                                onClick={() => {
                                  setEditingMealId(meal.id);
                                  setEditForm({
                                    name: meal.name,
                                    quantity: meal.quantity,
                                    calories: String(meal.nutrients.calories),
                                    proteinG: String(meal.nutrients.proteinG),
                                    carbsG: String(meal.nutrients.carbsG),
                                    fatG: String(meal.nutrients.fatG),
                                  });
                                }}
                              >✎</button>
                              <button
                                className="meal-delete-btn"
                                title="Delete meal"
                                onClick={async () => {
                                  await apiRequest(`/api/meals/${meal.id}?userId=${userId}`, { method: "DELETE" });
                                  await refreshSummary();
                                }}
                              >✕</button>
                            </div>
                          </>
                        )}
                      </article>
                    ))
                  ) : (
                    <p className="empty-state">No meals logged yet. Add one to see the report fill up.</p>
                  )}
                </div>
              </div>

              <div className="report-summary">
                <h3>Nutrient balance</h3>
                <ProgressBar label="Protein remaining" value={summary.remaining.proteinG} max={summary.targets.proteinG} suffix=" g left" />
                <ProgressBar label="Carbs remaining" value={summary.remaining.carbsG} max={summary.targets.carbsG} suffix=" g left" />
                <ProgressBar label="Fat remaining" value={summary.remaining.fatG} max={summary.targets.fatG} suffix=" g left" />
                <ProgressBar label="Fiber remaining" value={summary.remaining.fiberG} max={summary.targets.fiberG} suffix=" g left" />
                <Metric label="Activity burn" value={`${Math.round(summary.activityBurn ?? 0)} kcal`} />

                <div className="two-metric">
                  <Metric label="Nutritional score" value={`${summary.score}/100`} />
                  <Metric label="Goal achievement" value={`${summary.goalAchievementPercentage}%`} />
                </div>
              </div>
            </div>
          ) : (
            <p className="empty-state">
              The daily summary will appear here once meals are logged for the selected date.
            </p>
          )}
        </section>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      </div>
    </div>
  );
}


function CalorieRing({ value, max }: { value: number; max: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 128;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 10;

    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";
    ctx.lineWidth = 11;
    ctx.strokeStyle = "rgba(131,143,125,0.22)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#0e7c66";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
  }, [pct]);

  return (
    <div className="ring-wrap">
      <canvas ref={canvasRef} width={128} height={128} />
      <div className="ring-center">
        <strong>{Math.round(value)}</strong>
        <span>of {Math.round(max)} kcal</span>
      </div>
    </div>
  );
}

function MacroBar({
  label,
  color,
  consumed,
  target,
  unit,
}: {
  label: string;
  color: string;
  consumed: number;
  target: number;
  unit: string;
}) {
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;

  return (
    <div className="macro-item">
      <div className="label">
        <span>{label}</span>
        <b>
          {Math.round(consumed)}
          {unit} / {Math.round(target)}
          {unit}
        </b>
      </div>
      <div className="mini-track">
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Landing({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  return (
    <div className="landing">
      <header className="landing-top">
        <div className="brand-lockup">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 3C12 3 20 7 20 13C20 18 16 21 12 21C8 21 4 18 4 13C4 7 12 3 12 3Z" fill="white" />
            </svg>
          </div>
          <strong>NutriCore</strong>
        </div>
        <nav className="landing-top-links">
          <span>How it works</span>
          <span>Assessment</span>
          <span>Pricing</span>
        </nav>
        <div className="landing-top-actions">
          <button type="button" className="secondary compact" onClick={onLogin}>
            Log in
          </button>
          <button type="button" className="compact" onClick={onGetStarted}>
            Get started
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div>
          <p className="eyebrow">AI-powered nutrition tracking</p>
          <h1>Read your blood report. Photograph your plate. Know exactly where you stand.</h1>
          <p className="lede">
            NutriCore turns a blood report and a meal photo into a daily target, a running score,
            and a WhatsApp check-in — no manual food diary required.
          </p>
          <div className="landing-hero-actions">
            <button type="button" onClick={onGetStarted}>
              Start your assessment
            </button>
            <button type="button" className="secondary" onClick={onLogin}>
              Log in
            </button>
          </div>
          <div className="trust-row">
            <div>
              <strong>40s</strong>avg. meal log time
            </div>
            <div>
              <strong>92%</strong>estimate accuracy*
            </div>
            <div>
              <strong>18k+</strong>reports analyzed
            </div>
          </div>
        </div>

        <div className="preview-card">
          <div className="preview-top">
            <span>Today's report</span>
            <span className="score-badge score-good">Score 82</span>
          </div>
          <div className="preview-meal">
            <strong>Masala oats with almonds</strong>
            <span>320 kcal</span>
          </div>
          <div className="preview-meal">
            <strong>Grilled chicken salad bowl</strong>
            <span>480 kcal</span>
          </div>
          <div className="preview-meal">
            <strong>Dal chawal, home-cooked</strong>
            <span>740 kcal</span>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-feature">
          <div className="num">01</div>
          <h3>Blood-aware targets</h3>
          <p>Upload a report once — AI reads it and sets calorie and macro targets suited to your actual biomarkers.</p>
        </div>
        <div className="landing-feature">
          <div className="num">02</div>
          <h3>Photo-first meal log</h3>
          <p>Snap your plate. AI estimates the dish, portion and full nutrient breakdown in seconds.</p>
        </div>
        <div className="landing-feature">
          <div className="num">03</div>
          <h3>Activity in one view</h3>
          <p>Steps, water and burn estimates sit next to your meals so the daily math stays honest.</p>
        </div>
        <div className="landing-feature">
          <div className="num">04</div>
          <h3>A digest, not a diary</h3>
          <p>Get a short WhatsApp check-in each evening — what you hit, what to adjust tomorrow.</p>
        </div>
      </section>

      <section className="landing-flow">
        <div>
          <h2>Three steps, once a day.</h2>
          <p>
            No categories to memorize, no barcode scanning. NutriCore is built around the two
            things people actually have on hand — their phone camera and a blood report.
          </p>
          <button type="button" onClick={onGetStarted}>
            Create your profile
          </button>
        </div>
        <div className="landing-steps">
          <div className="landing-step">
            <span className="idx">1</span>
            <div>
              <strong>Build your profile</strong>
              <span>Upload a blood report or answer six quick questions.</span>
            </div>
          </div>
          <div className="landing-step">
            <span className="idx">2</span>
            <div>
              <strong>Log meals by photo</strong>
              <span>AI estimates nutrition; edit only if something looks off.</span>
            </div>
          </div>
          <div className="landing-step">
            <span className="idx">3</span>
            <div>
              <strong>Read tonight's digest</strong>
              <span>A score, what's low, and one thing to change tomorrow.</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix: string;
}) {
  const ratio = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className="progress-item">
      <div className="progress-label">
        <span>{label}</span>
        <strong>
          {Math.round(value)}
          {suffix}
        </strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
