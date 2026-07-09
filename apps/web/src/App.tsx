import { GoogleLogin } from "@react-oauth/google";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { FormEvent } from "react";
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
type AuthView = "login" | "register" | "forgot" | "verify-otp" | "reset" | "google-profile";
type TabView = "dashboard" | "food-search" | "water" | "body" | "templates" | "trends" | "articles";

interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  source: string;
  servingSize: string;
  imageUrl?: string | null;
  nutrients: Record<string, number>;
}

interface WaterLog {
  _id: string;
  amountMl: number;
  date: string;
  loggedAt: string;
}

interface BodyMetric {
  _id: string;
  date: string;
  weightKg?: number;
  bmi?: number;
  bodyFatPercent?: number;
  muscleMassKg?: number;
  waistCm?: number;
  notes?: string;
}

interface MealTemplate {
  _id: string;
  name: string;
  description: string;
  mealType: string;
  items: { name: string; quantity: string; nutrients: Record<string, number> }[];
  totalNutrients: Record<string, number>;
  tags: string[];
  usageCount: number;
}

interface Article {
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  imageUrl: string | null;
  source: string;
}

interface TrendDay {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  activityBurn: number;
  netCalories: number;
  waterMl: number;
  mealCount: number;
  weightKg: number | null;
  goalMet: boolean;
}


const nutrientDefaults: NutrientBreakdown = {
  calories: 420,
  proteinG: 18,
  carbsG: 48,
  fatG: 14,
  fiberG: 6,
  sugarG: 8,
  sodiumMg: 420,
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
  name: "Oats bowl",
  source: "manual",
  quantity: "1 bowl",
  eatenAt: toDateTimeLocalValue(new Date().toISOString()),
  nutrients: { ...nutrientDefaults },
});

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
    const message = String((payload as Record<string,unknown>)?.message || `Request failed with status ${response.status}`);
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
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailStatusMessage, setEmailStatusMessage] = useState("");

  // Navigation
  const [activeTab, setActiveTab] = useState<TabView>("dashboard");

  // Food search
  const [foodQuery, setFoodQuery] = useState("");
  const [foodResults, setFoodResults] = useState<FoodItem[]>([]);
  const [foodBusy, setFoodBusy] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [foodLogQty, setFoodLogQty] = useState("100");
  const [barcodeActive, setBarcodeActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Water tracker
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [waterTotal, setWaterTotal] = useState(0);
  const [waterGoalMl] = useState(2500);

  // Body metrics
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetric[]>([]);
  const [bodyForm, setBodyForm] = useState({ date: today(), weightKg: "", bmi: "", bodyFatPercent: "", waistCm: "", notes: "" });

  // Templates
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", mealType: "snack", tags: "" });
  const [templateItems, setTemplateItems] = useState<{ name: string; quantity: string; calories: string; proteinG: string; carbsG: string; fatG: string }[]>([]);

  // Trends
  const [trendDays, setTrendDays] = useState<TrendDay[]>([]);
  const [trendStreak, setTrendStreak] = useState(0);
  const [trendMetric, setTrendMetric] = useState<"calories" | "proteinG" | "waterMl" | "netCalories">("calories");

  // Articles
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesBusy, setArticlesBusy] = useState(false);
  const [busy, setBusy] = useState({
    assessment: false,
    meal: false,
    summary: false,
    blood: false,
    food: false,
    activity: false,
    email: false,
  });
  const [error, setError] = useState("");

  const [authView, setAuthView] = useState<AuthView>("login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [pendingGoogleSession, setPendingGoogleSession] = useState<{ token: string; userId: string; name: string; picture?: string } | null>(null);
  const [googleProfileForm, setGoogleProfileForm] = useState({ dob: "", weightKg: "" });
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    otpEmail: "",
    otp: "",
    phone: "",
    countryCode: "+91",
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
            weightKg: savedAssessment.weightKg,
            gender: savedAssessment.gender,
            activityLevel: savedAssessment.activityLevel,
            goal: savedAssessment.goal,
            healthConditions: savedAssessment.healthConditions,
            allergies: savedAssessment.allergies,
            dietaryPreferences: savedAssessment.dietaryPreferences,
          });
        }

        if (latestSummary) {
          setSummary(latestSummary);
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

  // ── Data fetching for new features ──────────────────────────────────────────
  const fetchWater = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest<{ logs: WaterLog[]; totalMl: number }>(`/api/water?userId=${encodeURIComponent(userId)}&date=${selectedDate}`);
      setWaterLogs(res.logs);
      setWaterTotal(res.totalMl);
    } catch {}
  }, [userId, selectedDate]);

  const fetchBodyMetrics = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest<{ metrics: BodyMetric[] }>(`/api/body?userId=${encodeURIComponent(userId)}`);
      setBodyMetrics(res.metrics);
    } catch {}
  }, [userId]);

  const fetchTemplates = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest<{ templates: MealTemplate[] }>(`/api/templates?userId=${encodeURIComponent(userId)}`);
      setTemplates(res.templates);
    } catch {}
  }, [userId]);

  const fetchTrends = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest<{ days: TrendDay[]; streak: number }>(`/api/trends/weekly?userId=${encodeURIComponent(userId)}&days=14`);
      setTrendDays(res.days);
      setTrendStreak(res.streak);
    } catch {}
  }, [userId]);

  const fetchArticles = useCallback(async () => {
    if (articles.length > 0) return;
    setArticlesBusy(true);
    try {
      const res = await apiRequest<{ articles: Article[] }>("/api/foods/articles");
      setArticles(res.articles);
    } catch {} finally {
      setArticlesBusy(false);
    }
  }, [articles.length]);

  useEffect(() => {
    if (!userId) return;
    fetchWater();
    fetchBodyMetrics();
    fetchTemplates();
    fetchTrends();
  }, [userId, selectedDate, fetchWater, fetchBodyMetrics, fetchTemplates, fetchTrends]);

  useEffect(() => {
    if (activeTab === "articles") fetchArticles();
  }, [activeTab, fetchArticles]);

  // Ensure body background is always the light theme color
  useEffect(() => {
    document.body.style.background = "";
    document.body.style.color = "";
  }, []);

  // ── Food search handler ───────────────────────────────────────────────────
  const handleFoodSearch = async (q: string) => {
    if (!q.trim()) { setFoodResults([]); return; }
    setFoodBusy(true);
    try {
      const res = await apiRequest<{ foods: FoodItem[] }>(`/api/foods/search?q=${encodeURIComponent(q)}&source=all&limit=15`);
      setFoodResults(res.foods);
    } catch {} finally {
      setFoodBusy(false);
    }
  };

  const handleLogFoodItem = async (food: FoodItem) => {
    if (!userId) return;
    const multiplier = Number(foodLogQty) / 100;
    const scaled: Record<string, number> = {};
    for (const [k, v] of Object.entries(food.nutrients)) scaled[k] = Math.round(v * multiplier * 10) / 10;
    try {
      await apiRequest("/api/meals", {
        method: "POST",
        body: JSON.stringify({
          userId,
          name: food.name + (food.brand ? ` (${food.brand})` : ""),
          source: "search",
          quantity: `${foodLogQty}g`,
          eatenAt: new Date().toISOString(),
          nutrients: {
            calories: scaled.calories ?? 0,
            proteinG: scaled.proteinG ?? 0,
            carbsG: scaled.carbsG ?? 0,
            fatG: scaled.fatG ?? 0,
            fiberG: scaled.fiberG ?? 0,
            sugarG: scaled.sugarG ?? 0,
            sodiumMg: scaled.sodiumMg ?? 0,
          },
        }),
      });
      setSelectedFood(null);
      alert(`Logged: ${food.name} (${foodLogQty}g)`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to log food");
    }
  };

  // Barcode scanner
  const startBarcode = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setBarcodeActive(true);

      // Use BarcodeDetector if available
      if ("BarcodeDetector" in window) {
        const detector = new (window as unknown as { BarcodeDetector: { new(opts: object): { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } } }).BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const scan = async () => {
          if (!videoRef.current || !barcodeActive) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              stopBarcode();
              const barcode = codes[0].rawValue;
              const res = await apiRequest<{ food: FoodItem }>(`/api/foods/barcode/${barcode}`);
              setSelectedFood(res.food);
              setActiveTab("food-search");
            } else {
              requestAnimationFrame(scan);
            }
          } catch { requestAnimationFrame(scan); }
        };
        requestAnimationFrame(scan);
      }
    } catch { alert("Camera access denied"); }
  };

  const stopBarcode = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setBarcodeActive(false);
  };

  // Water log handler
  const handleLogWater = async (amountMl: number) => {
    if (!userId) return;
    try {
      const res = await apiRequest<{ totalMl: number; log: WaterLog }>("/api/water", {
        method: "POST",
        body: JSON.stringify({ userId, amountMl, date: selectedDate }),
      });
      setWaterTotal(res.totalMl);
      setWaterLogs(prev => [...prev, res.log]);
    } catch {}
  };

  // Body metric handler
  const handleLogBodyMetric = async () => {
    if (!userId) return;
    try {
      const payload: Record<string, unknown> = { userId, date: bodyForm.date, notes: bodyForm.notes };
      if (bodyForm.weightKg) payload.weightKg = Number(bodyForm.weightKg);
      if (bodyForm.bmi) payload.bmi = Number(bodyForm.bmi);
      if (bodyForm.bodyFatPercent) payload.bodyFatPercent = Number(bodyForm.bodyFatPercent);
      if (bodyForm.waistCm) payload.waistCm = Number(bodyForm.waistCm);
      await apiRequest("/api/body", { method: "POST", body: JSON.stringify(payload) });
      fetchBodyMetrics();
      setBodyForm({ date: today(), weightKg: "", bmi: "", bodyFatPercent: "", waistCm: "", notes: "" });
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to log metric"); }
  };

  // Template handler
  const handleSaveTemplate = async () => {
    if (!userId || !templateForm.name) return;
    try {
      const items = templateItems.map(i => ({
        name: i.name,
        quantity: i.quantity,
        nutrients: { calories: Number(i.calories), proteinG: Number(i.proteinG), carbsG: Number(i.carbsG), fatG: Number(i.fatG), fiberG: 0, sugarG: 0, sodiumMg: 0 },
      }));
      await apiRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify({ userId, ...templateForm, tags: templateForm.tags.split(",").map(t => t.trim()).filter(Boolean), items }),
      });
      fetchTemplates();
      setTemplateForm({ name: "", description: "", mealType: "snack", tags: "" });
      setTemplateItems([]);
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to save template"); }
  };

  const handleLogTemplate = async (id: string) => {
    if (!userId) return;
    try {
      await apiRequest(`/api/templates/${id}/log`, { method: "POST", body: JSON.stringify({ userId }) });
      fetchTrends();
      alert("Template logged as meal!");
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to log template"); }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await apiRequest(`/api/templates/${id}`, { method: "DELETE" });
      setTemplates(prev => prev.filter(t => t._id !== id));
    } catch {}
  };

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

  const emailPreview = useMemo(() => {
    if (!summary) {
      return "Your email summary will appear here after you log meals and generate a daily report.";
    }
    const mealNames = summary.meals.map((m) => m.name).join(", ") || "No meals logged";
    return [
      `NutriCore Daily Summary — ${selectedDate}`,
      `Meals: ${mealNames}`,
      `Calories: ${Math.round(summary.consumed.calories)} / ${Math.round(summary.targets.calories)} kcal`,
      `Protein: ${Math.round(summary.consumed.proteinG)}g  Carbs: ${Math.round(summary.consumed.carbsG)}g  Fat: ${Math.round(summary.consumed.fatG)}g`,
      `Activity burn: ${Math.round(summary.activityBurn ?? 0)} kcal`,
      `Score: ${summary.score}/100`,
      `Tip: ${recommendations[0] ?? "Keep going!"}`,
    ].join("\n");
  }, [recommendations, selectedDate, summary]);

  const handleAssessmentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, assessment: true }));
    setError("");

    try {
      const saved = bloodReportDataUrl
        ? await apiRequest<{ assessment: AssessmentResult; analysis: BloodAnalysisResult }>("/api/reports/blood", {
              method: "POST",
              body: JSON.stringify({
                userId,
                weightKg: assessmentForm.weightKg,
                fileDataUrl: bloodReportDataUrl,
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
        weightKg: saved.assessment.weightKg,
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

  const handleEmailSummarySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, email: true }));
    setError("");

    try {
      const response = await apiRequest<{ sent: boolean; reason?: string; to?: string }>(
        "/api/email/daily-summary",
        {
          method: "POST",
          body: JSON.stringify({
            userId,
            date: selectedDate,
            to: emailRecipient.trim() || undefined,
          }),
        },
      );
      setEmailStatusMessage(
        response.sent
          ? `Summary sent to ${response.to}`
          : response.reason ?? "Email queued — configure SMTP in .env to actually send.",
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to send email summary");
    } finally {
      setBusy((current) => ({ ...current, email: false }));
    }
  };

  async function refreshSummary(nextDate = selectedDate) {
    setBusy((current) => ({ ...current, summary: true }));

    try {
      const latest = await apiRequest<SummaryResponse>(
        `/api/summary/${nextDate}?userId=${encodeURIComponent(userId)}`,
      );
      setSummary(latest);
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
        body: JSON.stringify({ phone: authForm.countryCode + authForm.phone, password: authForm.password }),
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
          email: authForm.email.trim() || undefined,
          phone: authForm.countryCode + authForm.phone,
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
      await apiRequest<{ sent: boolean }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: authForm.otpEmail }),
      });
      setAuthView("verify-otp");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = await apiRequest<{ resetToken: string }>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email: authForm.otpEmail, otp: authForm.otp }),
      });
      setResetToken(result.resetToken);
      setAuthView("reset");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Invalid OTP");
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


  const handleGoogleAuth = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const res = await fetch(`${API}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      const data = await res.json() as { token?: string; userId?: string; name?: string; picture?: string; needsProfile?: boolean; message?: string };
      if (!res.ok) { setAuthError(data.message ?? "Google sign-in failed."); return; }
      if (data.needsProfile) {
        setPendingGoogleSession({ token: data.token!, userId: data.userId!, name: data.name!, picture: data.picture });
        setAuthView("google-profile");
      } else {
        const session = { token: data.token!, userId: data.userId!, name: data.name! };
        window.localStorage.setItem("nutrition:auth", JSON.stringify(session));
        setCurrentUser(session);
      }
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleProfileComplete = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleSession) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      await fetch(`${API}/api/health/assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": pendingGoogleSession.userId },
        body: JSON.stringify({ userId: pendingGoogleSession.userId, dob: googleProfileForm.dob, weightKg: Number(googleProfileForm.weightKg), profileSource: "google" }),
      });
      // Also patch user record with dob/weight
      await fetch(`${API}/api/auth/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pendingGoogleSession.userId, dob: googleProfileForm.dob, weightKg: Number(googleProfileForm.weightKg) }),
      }).catch(() => undefined);
      const session = { token: pendingGoogleSession.token, userId: pendingGoogleSession.userId, name: pendingGoogleSession.name };
      window.localStorage.setItem("nutrition:auth", JSON.stringify(session));
      setCurrentUser(session);
      setPendingGoogleSession(null);
    } catch {
      setAuthError("Failed to save profile. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem("nutrition:auth");
    setCurrentUser(null);
    setAuthView("login");
    setAuthForm({ name: "", phone: "", countryCode: "+91", dob: "", weightKg: "", password: "", confirmPassword: "", newPassword: "", confirmNewPassword: "" });
    setAuthError("");
  };

  const openAuth = (view: AuthView) => {
    setAuthView(view);
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

  return (
    <main className="app-shell">
      <header className="site-nav">
        <div className="brand-lockup">
          <div className="brand-mark">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="9" fill="white" fillOpacity="0.2"/>
              <path d="M11 4 C11 4 7 6.5 7 10 C7 12.5 8.5 14 11 14 C13.5 14 15 12.5 15 10 C15 6.5 11 4 11 4Z" fill="white" fillOpacity="0.9"/>
              <path d="M11 14 L11 18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7"/>
              <path d="M8.5 11 Q11 13 13.5 11" stroke="white" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5" fill="none"/>
              <circle cx="16" cy="6" r="2" fill="white" fillOpacity="0.6"/>
              <path d="M15 5 L17 7" stroke="white" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.8"/>
            </svg>
          </div>
          <div>
            <strong>NutriCore</strong>
            <span>Smart nutrition tracking</span>
          </div>
        </div>

        <nav className="nav-links" aria-label="Primary">
          {[
            { id: "dashboard", label: "Home" },
            { id: "food-search", label: "Food Search" },
            { id: "water", label: "Water" },
            { id: "body", label: "Body" },
            { id: "templates", label: "Templates" },
            { id: "trends", label: "Trends" },
            { id: "articles", label: "Articles" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab${activeTab === tab.id ? " nav-tab--active" : ""}`}
              onClick={() => setActiveTab(tab.id as TabView)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="nav-actions">
          <span className="nav-user-desktop">
            {currentUser ? (
              <>
                <span className="nav-user">Hi, {currentUser.name}</span>
                <button type="button" className="secondary compact" onClick={handleLogout}>
                  Log Out
                </button>
              </>
            ) : (
              <>
                <button type="button" className="nav-link" onClick={() => openAuth("login")}>
                  Log In
                </button>
                <button type="button" className="secondary compact" onClick={() => openAuth("register")}>
                  Sign Up
                </button>
              </>
            )}
          </span>
          <button
            type="button"
            aria-label="Toggle menu"
            className={`hamburger-btn${mobileMenuOpen ? " open" : ""}`}
            onClick={() => setMobileMenuOpen((o) => !o)}
          >
            <span />
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <>
          <div className="mobile-nav-overlay open" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-drawer">
            <nav className="mobile-nav-links" aria-label="Mobile navigation">
              {[
                { id: "dashboard", label: "🏠 Home" },
                { id: "food-search", label: "🔍 Food Search" },
                { id: "water", label: "💧 Water" },
                { id: "body", label: "⚖️ Body" },
                { id: "templates", label: "📋 Templates" },
                { id: "trends", label: "📈 Trends" },
                { id: "articles", label: "📰 Articles" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`mobile-nav-tab${activeTab === tab.id ? " mobile-nav-tab--active" : ""}`}
                  onClick={() => { setActiveTab(tab.id as TabView); setMobileMenuOpen(false); }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="mobile-nav-footer">
              {currentUser ? (
                <>
                  <span className="mobile-nav-user">Signed in as <strong>{currentUser.name}</strong></span>
                  <button type="button" className="mobile-logout-btn" onClick={() => { handleLogout(); setMobileMenuOpen(false); }}>
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="mobile-logout-btn" onClick={() => { openAuth("login"); setMobileMenuOpen(false); }}>
                    Log In
                  </button>
                  <button type="button" className="mobile-logout-btn" onClick={() => { openAuth("register"); setMobileMenuOpen(false); }}>
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "dashboard" && (<>
      <section className="home-banner">
        <div className="home-banner-content">
          <p className="eyebrow animate-fade-in">AI-powered smart nutrition</p>
          <h1 className="animate-slide-up">Track every bite.<br/>Own your health.</h1>
          <p className="lede animate-slide-up anim-delay-1">
            Build your profile, log meals, analyze nutrition gaps, and get daily AI summaries — all in one place.
          </p>
          <div className="hero-actions animate-slide-up anim-delay-2">
            <button type="button" onClick={() => document.getElementById("assessment")?.scrollIntoView({ behavior: "smooth" })}>
              Get started
            </button>
            <button type="button" className="secondary" onClick={() => document.getElementById("meal")?.scrollIntoView({ behavior: "smooth" })}>
              Log a meal
            </button>
          </div>
        </div>
        <div className="home-banner-stats animate-slide-up anim-delay-3">
          <div className="banner-stat">
            <strong>{assessment?.targetCalories ? Math.round(assessment.targetCalories) : "—"}</strong>
            <span>Daily kcal target</span>
          </div>
          <div className="banner-stat">
            <strong>{summary?.consumed.calories ? Math.round(summary.consumed.calories) : "0"}</strong>
            <span>Calories today</span>
          </div>
          <div className="banner-stat">
            <strong>{summary?.meals.length ?? 0}</strong>
            <span>Meals logged</span>
          </div>
          <div className="banner-stat">
            <strong>{healthScore}</strong>
            <span>Health score</span>
          </div>
        </div>
      </section>

      <div className="home-feature-row animate-slide-up anim-delay-2">
          <div className="feature-mosaic">
            <article className="feature-card feature-card--amber">
              <p className="feature-label">Develop healthy habits</p>
              <h3>Build momentum with visible daily targets.</h3>
              <p>
                Your profile, meals, and daily summary stay in sync so each decision feels
                easier than the last.
              </p>
              <div className="feature-pills">
                <span>Assessment</span>
                <span>Meals</span>
                <span>Activity</span>
              </div>
            </article>

            <article className="feature-card feature-card--sky">
              <p className="feature-label">Connect with devices</p>
              <h3>Bring steps, water, and activity into the same view.</h3>
              <div className="mini-metrics">
                <div>
                  <strong>{assessment?.targetCalories ? formatNumber(assessment.targetCalories, "") : "2,000"}</strong>
                  <span>Target kcal</span>
                </div>
                <div>
                  <strong>{formatNumber(summary?.goalAchievementPercentage ?? 0, "%")}</strong>
                  <span>Goal achieved</span>
                </div>
                <div>
                  <strong>{formatNumber(summary?.meals.length ?? 0, "")}</strong>
                  <span>Meals logged</span>
                </div>
              </div>
            </article>

            <article className="feature-card feature-card--mint">
              <p className="feature-label">Track vitamins & minerals</p>
              <h3>See the nutrients that still need attention.</h3>
              <div className="feature-bars">
                <div>
                  <span>Protein</span>
                  <div className="tiny-track">
                    <div
                      className="tiny-fill tiny-fill--protein"
                      style={{ width: `${Math.min(100, summary ? (summary.consumed.proteinG / summary.targets.proteinG) * 100 : 35)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <span>Fiber</span>
                  <div className="tiny-track">
                    <div
                      className="tiny-fill tiny-fill--fiber"
                      style={{ width: `${Math.min(100, summary ? (summary.consumed.fiberG / summary.targets.fiberG) * 100 : 28)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <span>Sodium</span>
                  <div className="tiny-track">
                    <div
                      className="tiny-fill tiny-fill--sodium"
                      style={{ width: `${Math.min(100, summary ? (summary.consumed.sodiumMg / summary.targets.sodiumMg) * 100 : 52)}%` }}
                    />
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

      <div className="home-dashboard-row animate-slide-up anim-delay-3">
          <div className="dashboard-card home-today-card">
            <div className="card-header">
              <div>
                <p className="card-kicker">Today</p>
                <h2>Daily overview</h2>
              </div>
              <span className={`score-badge ${healthScore >= 75 ? "score-good" : healthScore >= 50 ? "score-warn" : ""}`}>
                Score {healthScore}
              </span>
            </div>

            <div className="date-row">
              <label className="field">
                <span>Daily report date</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
              <button type="button" className="secondary compact" onClick={() => void refreshSummary()} disabled={busy.summary}>
                {busy.summary ? "Refreshing..." : "Refresh report"}
              </button>
            </div>

            <div className="stats-grid">
              <StatTile label="Calories" value={`${Math.round(summary?.consumed.calories ?? 0)} / ${Math.round(summary?.targets.calories ?? assessment?.targetCalories ?? 0)}`} />
              <StatTile label="Protein" value={`${Math.round(summary?.consumed.proteinG ?? 0)}g / ${Math.round(summary?.targets.proteinG ?? assessment?.macroTargets.proteinG ?? 0)}g`} />
              <StatTile label="Carbs" value={`${Math.round(summary?.consumed.carbsG ?? 0)}g / ${Math.round(summary?.targets.carbsG ?? assessment?.macroTargets.carbsG ?? 0)}g`} />
              <StatTile label="Fat" value={`${Math.round(summary?.consumed.fatG ?? 0)}g / ${Math.round(summary?.targets.fatG ?? assessment?.macroTargets.fatG ?? 0)}g`} />
            </div>

            <div className="progress-stack">
              <ProgressBar label="Calories left" value={remainingCalories} max={assessment?.targetCalories ?? summary?.targets.calories ?? 2000} suffix=" kcal remaining" />
              <ProgressBar
                label="Goal achievement"
                value={completion}
                max={100}
                suffix="%"
              />
            </div>

            <div className="insights">
              <h3>Smart recommendations</h3>
              <ul>
                {recommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="dashboard-card">
            <div id="summary" />
            <div className="card-header">
              <div>
                <p className="card-kicker">Email</p>
                <h2>Daily summary preview</h2>
              </div>
              <span className="score-badge score-blue">Preview</span>
            </div>

            <pre className="summary-preview">{emailPreview}</pre>
          </div>
      </div>

      <section className="content-grid">
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
                <span>Quantity (optional)</span>
                <input
                  value={mealForm.quantity}
                  onChange={(event) => setMealForm((current) => ({ ...current, quantity: event.target.value }))}
                  placeholder="1 bowl, 2 slices, 180g"
                />
              </label>
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
                  <span>Meal name</span>
                  <input
                    value={mealForm.name}
                    onChange={(event) => setMealForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g. oats with berries"
                  />
                </label>
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
                <label className="field">
                  <span>Quantity fallback</span>
                  <input
                    value={mealForm.quantity}
                    onChange={(event) => setMealForm((current) => ({ ...current, quantity: event.target.value }))}
                    placeholder="1 bowl, 2 slices, 180g"
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

        <section className="dashboard-card form-card" id="email-summary">
          <div className="card-header">
            <div>
              <p className="card-kicker">Step 4</p>
              <h2>Email daily summary</h2>
            </div>
            <span className="score-badge score-green">Free</span>
          </div>

          <form className="stack" onSubmit={handleEmailSummarySubmit}>
            <div className="form-grid two-col">
              <label className="field">
                <span>Recipient email</span>
                <input
                  type="email"
                  value={emailRecipient}
                  onChange={(event) => setEmailRecipient(event.target.value)}
                  placeholder="Leave blank to use account email"
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
                <span>
                  {emailStatusMessage ||
                    "Sends a beautiful HTML nutrition report to your email. Configure Gmail SMTP in .env to activate."}
                </span>
              </div>
              <button type="submit" disabled={busy.email}>
                {busy.email ? "Sending..." : "Send email summary"}
              </button>
            </div>
          </form>
        </section>

        <section className="dashboard-card form-card full-width-card">
          <div className="card-header">
            <div>
              <p className="card-kicker">Step 5</p>
              <h2>Daily report</h2>
            </div>
            <span className={`score-badge ${completion >= 75 ? "score-good" : "score-warn"}`}>
              {completion}% goal
            </span>
          </div>

          {summary ? (
            <div className="report-layout">
              <div className="report-meals">
                <h3>Meals consumed</h3>
                <div className="meal-list">
                  {summary.meals.length ? (
                    summary.meals.map((meal) => (
                      <article key={meal.id} className="meal-card">
                        <div>
                          <strong>{meal.name}</strong>
                          <span>{meal.quantity} · {formatLabel(meal.source)}</span>
                        </div>
                        <div className="meal-values">
                          <span>{meal.nutrients.calories} kcal</span>
                          <span>P {meal.nutrients.proteinG}g</span>
                          <span>C {meal.nutrients.carbsG}g</span>
                          <span>F {meal.nutrients.fatG}g</span>
                        </div>
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


      </>)}

      {/* ── FOOD SEARCH ─────────────────────────────────────────────────── */}
      {activeTab === "food-search" && (
        <div className="tab-content">
          <div className="tab-header">
            <h2>Food Search</h2>
            <p>Search 1M+ foods from USDA & Open Food Facts. Scan a barcode or type a name.</p>
          </div>

          <div className="food-search-bar">
            <input
              type="text"
              placeholder="Search foods... (e.g. banana, chicken breast, maggi)"
              value={foodQuery}
              onChange={(e) => { setFoodQuery(e.target.value); handleFoodSearch(e.target.value); }}
              className="food-search-input"
            />
            <button type="button" className="barcode-btn" onClick={barcodeActive ? stopBarcode : startBarcode} title="Scan barcode">
              {barcodeActive ? "✕ Stop" : "📷 Barcode"}
            </button>
          </div>

          {barcodeActive && (
            <div className="barcode-scanner">
              <video ref={videoRef} className="barcode-video" playsInline muted />
              <p className="barcode-hint">Point camera at barcode...</p>
            </div>
          )}

          {foodBusy && <div className="loading-bar"><div className="loading-bar-fill" /></div>}

          {selectedFood && (
            <div className="food-detail-card">
              <div className="food-detail-header">
                {selectedFood.imageUrl && <img src={selectedFood.imageUrl} alt={selectedFood.name} className="food-detail-img" />}
                <div>
                  <h3>{selectedFood.name}</h3>
                  {selectedFood.brand && selectedFood.brand !== "undefined" && <p className="food-brand">{selectedFood.brand}</p>}
                  <span className={`source-badge source-badge--${selectedFood.source === "usda" ? "usda" : selectedFood.source === "wger" ? "wger" : "off"}`}>
                    {selectedFood.source === "usda" ? "USDA FoodData" : selectedFood.source === "wger" ? "Wger (Free)" : "Open Food Facts"}
                  </span>
                </div>
                <button type="button" className="close-btn" onClick={() => setSelectedFood(null)}>✕</button>
              </div>

              <div className="macro-grid">
                {[
                  { label: "Calories", value: selectedFood.nutrients.calories ?? 0, unit: "kcal", color: "#ff8a48" },
                  { label: "Protein", value: selectedFood.nutrients.proteinG ?? 0, unit: "g", color: "#3b82f6" },
                  { label: "Carbs", value: selectedFood.nutrients.carbsG ?? 0, unit: "g", color: "#22c55e" },
                  { label: "Fat", value: selectedFood.nutrients.fatG ?? 0, unit: "g", color: "#f59e0b" },
                  { label: "Fiber", value: selectedFood.nutrients.fiberG ?? 0, unit: "g", color: "#8b5cf6" },
                  { label: "Sugar", value: selectedFood.nutrients.sugarG ?? 0, unit: "g", color: "#ec4899" },
                ].map(m => (
                  <div className="macro-chip" key={m.label} style={{ "--chip-color": m.color } as React.CSSProperties}>
                    <strong>{Math.round(m.value)}{m.unit}</strong>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>

              {/* Micronutrients */}
              {Object.entries(selectedFood.nutrients).filter(([k]) => !["calories","proteinG","carbsG","fatG","fiberG","sugarG","sodiumMg"].includes(k)).length > 0 && (
                <div className="micronutrient-grid">
                  <h4>Micronutrients (per 100g)</h4>
                  <div className="micro-items">
                    {[
                      ["vitaminCMg", "Vitamin C", "mg"], ["vitaminDMcg", "Vitamin D", "mcg"],
                      ["vitaminB12Mcg", "Vitamin B12", "mcg"], ["vitaminAMcg", "Vitamin A", "mcg"],
                      ["vitaminKMcg", "Vitamin K", "mcg"], ["ironMg", "Iron", "mg"],
                      ["calciumMg", "Calcium", "mg"], ["potassiumMg", "Potassium", "mg"],
                      ["magnesiumMg", "Magnesium", "mg"], ["zincMg", "Zinc", "mg"],
                      ["folateMcg", "Folate", "mcg"], ["cholesterolMg", "Cholesterol", "mg"],
                      ["saturatedFatG", "Sat. Fat", "g"],
                    ].filter(([k]) => (selectedFood.nutrients[k] ?? 0) > 0).map(([k, label, unit]) => (
                      <div className="micro-item" key={k}>
                        <span>{label}</span>
                        <strong>{Math.round((selectedFood.nutrients[k] ?? 0) * 10) / 10}{unit}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="food-log-action">
                <label>
                  <span>Quantity (g)</span>
                  <input type="number" min="1" value={foodLogQty} onChange={e => setFoodLogQty(e.target.value)} />
                </label>
                <button type="button" onClick={() => handleLogFoodItem(selectedFood)}>
                  + Log to Diary
                </button>
              </div>
            </div>
          )}

          <div className="food-results">
            {foodResults.map(food => (
              <div
                key={food.id}
                className="food-result-row"
                onClick={() => { setSelectedFood(food); setFoodLogQty("100"); }}
              >
                {food.imageUrl && <img src={food.imageUrl} alt={food.name} className="food-thumb" />}
                <div className="food-result-info">
                  <strong>{food.name}</strong>
                  {food.brand && food.brand !== "undefined" && <span className="food-result-brand">{food.brand}</span>}
                </div>
                <div className="food-result-macros">
                  <span>{Math.round(food.nutrients.calories ?? 0)} kcal</span>
                  <span>{Math.round(food.nutrients.proteinG ?? 0)}g protein</span>
                </div>
                <span className={`source-badge source-badge--${food.source === "usda" ? "usda" : food.source === "wger" ? "wger" : "off"}`}>
                  {food.source === "usda" ? "USDA" : food.source === "wger" ? "Wger" : "OFF"}
                </span>
              </div>
            ))}
            {foodResults.length === 0 && foodQuery && !foodBusy && (
              <p className="empty-state">No results for "{foodQuery}". Try a different term.</p>
            )}
          </div>
        </div>
      )}

      {/* ── WATER TRACKER ───────────────────────────────────────────────── */}
      {activeTab === "water" && (
        <div className="tab-content">
          <div className="tab-header">
            <h2>Water Tracker</h2>
            <p>Stay hydrated. Daily goal: {waterGoalMl}ml ({(waterGoalMl / 1000).toFixed(1)}L)</p>
          </div>

          <div className="water-hero">
            <div className="water-ring-wrap">
              <svg viewBox="0 0 120 120" className="water-ring">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke="#818cf8" strokeWidth="10"
                  strokeDasharray={`${Math.min(100, (waterTotal / waterGoalMl) * 100) * 3.267} 326.7`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="water-ring-label">
                <strong>{(waterTotal / 1000).toFixed(2)}L</strong>
                <span>of {(waterGoalMl / 1000).toFixed(1)}L</span>
              </div>
            </div>

            <div className="water-quick-btns">
              {[150, 250, 350, 500].map(ml => (
                <button key={ml} type="button" className="water-quick-btn" onClick={() => handleLogWater(ml)}>
                  💧 {ml}ml
                </button>
              ))}
            </div>
          </div>

          <div className="water-log-list">
            <h4>Today's logs</h4>
            {waterLogs.length === 0 && <p className="empty-state">No water logged today yet.</p>}
            {waterLogs.map(log => (
              <div className="water-log-row" key={log._id}>
                <span>💧</span>
                <strong>{log.amountMl}ml</strong>
                <span className="log-time">{new Date(log.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <button type="button" className="del-btn" onClick={async () => {
                  await apiRequest(`/api/water/${log._id}`, { method: "DELETE" });
                  setWaterLogs(prev => prev.filter(l => l._id !== log._id));
                  setWaterTotal(prev => Math.max(0, prev - log.amountMl));
                }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BODY METRICS ────────────────────────────────────────────────── */}
      {activeTab === "body" && (
        <div className="tab-content">
          <div className="tab-header">
            <h2>Body Metrics</h2>
            <p>Track weight, BMI, body fat, and measurements over time.</p>
          </div>

          <div className="body-form card">
            <h4>Log today's metrics</h4>
            <div className="form-grid two-col">
              <label className="field">
                <span>Date</span>
                <input type="date" value={bodyForm.date} onChange={e => setBodyForm(f => ({ ...f, date: e.target.value }))} />
              </label>
              <label className="field">
                <span>Weight (kg)</span>
                <input type="number" step="0.1" placeholder="e.g. 72.5" value={bodyForm.weightKg} onChange={e => setBodyForm(f => ({ ...f, weightKg: e.target.value }))} />
              </label>
              <label className="field">
                <span>BMI</span>
                <input type="number" step="0.1" placeholder="e.g. 22.4" value={bodyForm.bmi} onChange={e => setBodyForm(f => ({ ...f, bmi: e.target.value }))} />
              </label>
              <label className="field">
                <span>Body Fat %</span>
                <input type="number" step="0.1" placeholder="e.g. 18.5" value={bodyForm.bodyFatPercent} onChange={e => setBodyForm(f => ({ ...f, bodyFatPercent: e.target.value }))} />
              </label>
              <label className="field">
                <span>Waist (cm)</span>
                <input type="number" step="0.5" placeholder="e.g. 80" value={bodyForm.waistCm} onChange={e => setBodyForm(f => ({ ...f, waistCm: e.target.value }))} />
              </label>
              <label className="field">
                <span>Notes</span>
                <input type="text" placeholder="Optional note" value={bodyForm.notes} onChange={e => setBodyForm(f => ({ ...f, notes: e.target.value }))} />
              </label>
            </div>
            <button type="button" onClick={handleLogBodyMetric}>Save Metrics</button>
          </div>

          {bodyMetrics.length > 1 && (
            <div className="card chart-card">
              <h4>Weight trend</h4>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={[...bodyMetrics].reverse().filter(m => m.weightKg)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} unit="kg" />
                  <Tooltip formatter={(v: unknown) => [`${Number(v)} kg`, "Weight"]} />
                  <Line type="monotone" dataKey="weightKg" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="body-metrics-list">
            {bodyMetrics.slice(0, 10).map(m => (
              <div className="body-metric-row card" key={m._id}>
                <strong>{m.date}</strong>
                {m.weightKg && <span>⚖️ {m.weightKg}kg</span>}
                {m.bmi && <span>📊 BMI {m.bmi}</span>}
                {m.bodyFatPercent && <span>🔥 {m.bodyFatPercent}% fat</span>}
                {m.waistCm && <span>📏 {m.waistCm}cm</span>}
                {m.notes && <span className="metric-note">{m.notes}</span>}
                <button type="button" className="del-btn" onClick={async () => {
                  await apiRequest(`/api/body/${m._id}`, { method: "DELETE" });
                  setBodyMetrics(prev => prev.filter(b => b._id !== m._id));
                }}>✕</button>
              </div>
            ))}
            {bodyMetrics.length === 0 && <p className="empty-state">No body metrics logged yet.</p>}
          </div>
        </div>
      )}

      {/* ── MEAL TEMPLATES ───────────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div className="tab-content">
          <div className="tab-header">
            <h2>Meal Templates</h2>
            <p>Save your favourite meals and log them in one click.</p>
          </div>

          <div className="card template-form">
            <h4>Create template</h4>
            <div className="form-grid two-col">
              <label className="field">
                <span>Template name</span>
                <input type="text" placeholder="e.g. My Breakfast" value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="field">
                <span>Meal type</span>
                <select value={templateForm.mealType} onChange={e => setTemplateForm(f => ({ ...f, mealType: e.target.value }))}>
                  {["breakfast","lunch","dinner","snack","recipe"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </label>
              <label className="field" style={{ gridColumn: "1/-1" }}>
                <span>Description</span>
                <input type="text" placeholder="Optional description" value={templateForm.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} />
              </label>
              <label className="field" style={{ gridColumn: "1/-1" }}>
                <span>Tags (comma separated)</span>
                <input type="text" placeholder="e.g. high-protein, quick" value={templateForm.tags} onChange={e => setTemplateForm(f => ({ ...f, tags: e.target.value }))} />
              </label>
            </div>

            <h5>Items</h5>
            {templateItems.map((item, i) => (
              <div className="template-item-row" key={i}>
                <input placeholder="Food name" value={item.name} onChange={e => setTemplateItems(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <input placeholder="Qty" value={item.quantity} onChange={e => setTemplateItems(prev => prev.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <input type="number" placeholder="kcal" value={item.calories} onChange={e => setTemplateItems(prev => prev.map((x, j) => j === i ? { ...x, calories: e.target.value } : x))} />
                <input type="number" placeholder="protein g" value={item.proteinG} onChange={e => setTemplateItems(prev => prev.map((x, j) => j === i ? { ...x, proteinG: e.target.value } : x))} />
                <input type="number" placeholder="carbs g" value={item.carbsG} onChange={e => setTemplateItems(prev => prev.map((x, j) => j === i ? { ...x, carbsG: e.target.value } : x))} />
                <input type="number" placeholder="fat g" value={item.fatG} onChange={e => setTemplateItems(prev => prev.map((x, j) => j === i ? { ...x, fatG: e.target.value } : x))} />
                <button type="button" className="del-btn" onClick={() => setTemplateItems(prev => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <div className="template-actions">
              <button type="button" className="secondary" onClick={() => setTemplateItems(prev => [...prev, { name: "", quantity: "", calories: "", proteinG: "", carbsG: "", fatG: "" }])}>
                + Add item
              </button>
              <button type="button" onClick={handleSaveTemplate}>Save Template</button>
            </div>
          </div>

          <div className="template-list">
            {templates.length === 0 && <p className="empty-state">No templates yet. Create your first above.</p>}
            {templates.map(t => (
              <div className="template-card card" key={t._id}>
                <div className="template-card-header">
                  <div>
                    <h4>{t.name}</h4>
                    <span className="meal-type-badge">{t.mealType}</span>
                    {t.description && <p className="template-desc">{t.description}</p>}
                  </div>
                  <div className="template-card-actions">
                    <button type="button" onClick={() => handleLogTemplate(t._id)}>Log</button>
                    <button type="button" className="secondary del-btn" onClick={() => handleDeleteTemplate(t._id)}>✕</button>
                  </div>
                </div>
                <div className="template-nutrients">
                  <span>🔥 {Math.round(t.totalNutrients.calories ?? 0)} kcal</span>
                  <span>💪 {Math.round(t.totalNutrients.proteinG ?? 0)}g protein</span>
                  <span>🌾 {Math.round(t.totalNutrients.carbsG ?? 0)}g carbs</span>
                  <span>🧈 {Math.round(t.totalNutrients.fatG ?? 0)}g fat</span>
                  {t.usageCount > 0 && <span className="usage-count">Used {t.usageCount}×</span>}
                </div>
                {t.tags.length > 0 && (
                  <div className="template-tags">
                    {t.tags.map(tag => <span key={tag} className="tag-chip">#{tag}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TRENDS ──────────────────────────────────────────────────────── */}
      {activeTab === "trends" && (
        <div className="tab-content">
          <div className="tab-header">
            <h2>Trends & Insights</h2>
            <p>14-day overview of your nutrition, activity, and hydration.</p>
          </div>

          <div className="streak-banner">
            <span className="streak-fire">🔥</span>
            <div>
              <strong>{trendStreak} day streak</strong>
              <span>Keep logging to maintain your streak!</span>
            </div>
          </div>

          <div className="trend-metric-tabs">
            {([
              { key: "calories", label: "Calories" },
              { key: "proteinG", label: "Protein" },
              { key: "waterMl", label: "Water" },
              { key: "netCalories", label: "Net Cal" },
            ] as { key: typeof trendMetric; label: string }[]).map(m => (
              <button key={m.key} type="button" className={`trend-tab${trendMetric === m.key ? " active" : ""}`} onClick={() => setTrendMetric(m.key)}>{m.label}</button>
            ))}
          </div>

          {trendDays.length > 0 && (
            <div className="card chart-card">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trendDays} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: unknown) => [
                      trendMetric === "waterMl" ? `${(Number(v)/1000).toFixed(2)}L` :
                      trendMetric === "proteinG" ? `${Math.round(Number(v))}g` :
                      `${Math.round(Number(v))} kcal`,
                      trendMetric === "waterMl" ? "Water" :
                      trendMetric === "proteinG" ? "Protein" :
                      trendMetric === "netCalories" ? "Net Calories" : "Calories"
                    ]}
                  />
                  <Bar
                    dataKey={trendMetric}
                    fill="#ff8a48"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="trend-day-list">
            {trendDays.slice(-7).map(d => (
              <div className={`trend-day-list-row${d.goalMet ? " goal-met" : ""}`} key={d.date}>
                <span className="tdr-date">{new Date(d.date + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
                <span className="tdr-cal">{Math.round(d.calories)} kcal</span>
                <span className="tdr-meals">{d.mealCount} meal{d.mealCount !== 1 ? "s" : ""}</span>
                {d.goalMet && <span style={{color:"var(--green-600)",fontWeight:700,fontSize:".875rem"}}>✓ Goal met</span>}
              </div>
            ))}
          </div>

          {trendDays.length > 0 && (
            <div className="card chart-card">
              <h4>Weight trend</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendDays.filter(d => d.weightKg)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} unit="kg" />
                  <Tooltip formatter={(v: unknown) => [`${Number(v)} kg`, "Weight"]} />
                  <Line type="monotone" dataKey="weightKg" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── ARTICLES ─────────────────────────────────────────────────────── */}
      {activeTab === "articles" && (
        <div className="tab-content">
          <div className="tab-header">
            <h2>Nutrition Articles</h2>
            <p>Curated health and nutrition knowledge to support your goals.</p>
          </div>

          {articlesBusy && <div className="loading-bar"><div className="loading-bar-fill" /></div>}

          <div className="articles-grid">
            {articles.map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="article-card"
              >
                {article.imageUrl && <img src={article.imageUrl} alt={article.title} className="article-img" />}
                <div className="article-body">
                  <span className="article-source">{article.source}</span>
                  <h4>{article.title}</h4>
                  {article.summary && <p>{article.summary}</p>}
                  {article.publishedAt && <time>{new Date(article.publishedAt).toLocaleDateString()}</time>}
                </div>
              </a>
            ))}
            {articles.length === 0 && !articlesBusy && (
              <p className="empty-state">Could not load articles. Check your internet connection.</p>
            )}
          </div>
        </div>
      )}


      {!currentUser && (
        <div className="auth-overlay">
          <div className="auth-card">

            {/* ── Left brand panel ── */}
            <div className="auth-panel">
              <div className="auth-brand">
                <div className="brand-mark">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="11" cy="11" r="9" fill="white" fillOpacity="0.2"/>
                    <path d="M11 4 C11 4 7 6.5 7 10 C7 12.5 8.5 14 11 14 C13.5 14 15 12.5 15 10 C15 6.5 11 4 11 4Z" fill="white" fillOpacity="0.9"/>
                    <path d="M11 14 L11 18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7"/>
                    <path d="M8.5 11 Q11 13 13.5 11" stroke="white" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5" fill="none"/>
                    <circle cx="16" cy="6" r="2" fill="white" fillOpacity="0.6"/>
                    <path d="M15 5 L17 7" stroke="white" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.8"/>
                  </svg>
                </div>
                <strong>NutriCore</strong>
              </div>
              <h2 className="auth-panel-headline">Track every meal.<br/>Own your health.</h2>
              <p className="auth-panel-tagline">AI-powered nutrition insights, blood report analysis, and daily summaries — personalized to your body and goals.</p>
              <div className="auth-panel-features">
                <div className="auth-panel-feature">
                  <span className="auth-feat-icon">🥗</span>
                  <span>Log meals with AI photo recognition</span>
                </div>
                <div className="auth-panel-feature">
                  <span className="auth-feat-icon">📊</span>
                  <span>Macro & micronutrient breakdown</span>
                </div>
                <div className="auth-panel-feature">
                  <span className="auth-feat-icon">🧬</span>
                  <span>Blood report analysis & profiling</span>
                </div>
                <div className="auth-panel-feature">
                  <span className="auth-feat-icon">📧</span>
                  <span>Daily email nutrition summaries</span>
                </div>
              </div>
            </div>

            {/* ── Right form panel ── */}
            <div className="auth-panel-form">
              <div className="auth-form-inner">

            {authView === "login" && (
              <form className="auth-form" onSubmit={handleLogin}>
                <h2>Welcome back</h2>
                <p className="auth-sub">Log in to your account</p>

                <div className="field">
                  <span>Phone number</span>
                  <div className="phone-group">
                    <select
                      value={authForm.countryCode}
                      onChange={(e) => setAuthForm((f) => ({ ...f, countryCode: e.target.value }))}
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+61">🇦🇺 +61</option>
                      <option value="+86">🇨🇳 +86</option>
                      <option value="+81">🇯🇵 +81</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+33">🇫🇷 +33</option>
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+7">🇷🇺 +7</option>
                      <option value="+62">🇮🇩 +62</option>
                      <option value="+92">🇵🇰 +92</option>
                      <option value="+880">🇧🇩 +880</option>
                      <option value="+234">🇳🇬 +234</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+966">🇸🇦 +966</option>
                      <option value="+65">🇸🇬 +65</option>
                      <option value="+60">🇲🇾 +60</option>
                      <option value="+27">🇿🇦 +27</option>
                    </select>
                    <input
                      type="tel"
                      placeholder="xxxxxxxxxx"
                      value={authForm.phone}
                      onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9]/g, "") }))}
                      required
                    />
                  </div>
                </div>
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


                <div className="auth-divider"><span>or</span></div>
                <div className="google-btn-wrap">
                  <GoogleLogin onSuccess={handleGoogleAuth} onError={() => setAuthError("Google sign-in failed.")} text="signin_with" shape="rectangular" theme="outline" size="large" width="100%" />
                </div>

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
                  <span>Email address</span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={authForm.email}
                    onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <div className="field">
                  <span>Phone number</span>
                  <div className="phone-group">
                    <select
                      value={authForm.countryCode}
                      onChange={(e) => setAuthForm((f) => ({ ...f, countryCode: e.target.value }))}
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+61">🇦🇺 +61</option>
                      <option value="+86">🇨🇳 +86</option>
                      <option value="+81">🇯🇵 +81</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+33">🇫🇷 +33</option>
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+7">🇷🇺 +7</option>
                      <option value="+62">🇮🇩 +62</option>
                      <option value="+92">🇵🇰 +92</option>
                      <option value="+880">🇧🇩 +880</option>
                      <option value="+234">🇳🇬 +234</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+966">🇸🇦 +966</option>
                      <option value="+65">🇸🇬 +65</option>
                      <option value="+60">🇲🇾 +60</option>
                      <option value="+27">🇿🇦 +27</option>
                    </select>
                    <input
                      type="tel"
                      placeholder="xxxxxxxxxx"
                      value={authForm.phone}
                      onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9]/g, "") }))}
                      required
                    />
                  </div>
                </div>
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


                <div className="auth-divider"><span>or</span></div>
                <div className="google-btn-wrap">
                  <GoogleLogin onSuccess={handleGoogleAuth} onError={() => setAuthError("Google sign-in failed.")} text="signup_with" shape="rectangular" theme="outline" size="large" width="100%" />
                </div>

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
                <p className="auth-sub">Enter your email to receive a one-time code</p>

                <label className="field">
                  <span>Email address</span>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={authForm.otpEmail}
                    onChange={(e) => setAuthForm((f) => ({ ...f, otpEmail: e.target.value }))}
                    required
                  />
                </label>

                {authError && <p className="auth-error">{authError}</p>}

                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Sending..." : "Send OTP"}
                </button>

                <div className="auth-links">
                  <button type="button" className="auth-text-btn" onClick={() => openAuth("login")}>
                    Back to login
                  </button>
                </div>
              </form>
            )}

            {authView === "verify-otp" && (
              <form className="auth-form" onSubmit={handleVerifyOtp}>
                <h2>Enter OTP</h2>
                <p className="auth-sub">We sent a 6-digit code to <strong>{authForm.otpEmail}</strong></p>

                <label className="field">
                  <span>One-time code</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    className="otp-input"
                    value={authForm.otp}
                    onChange={(e) => setAuthForm((f) => ({ ...f, otp: e.target.value.replace(/[^0-9]/g, "") }))}
                    required
                  />
                </label>

                {authError && <p className="auth-error">{authError}</p>}

                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Verifying..." : "Verify OTP"}
                </button>

                <div className="auth-links">
                  <button type="button" className="auth-text-btn" onClick={() => openAuth("forgot")}>
                    Resend OTP
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

            {authView === "google-profile" && (
              <form className="auth-form" onSubmit={handleGoogleProfileComplete}>
                <div className="google-profile-header">
                  {pendingGoogleSession?.picture && (
                    <img src={pendingGoogleSession.picture} alt="" className="google-avatar" />
                  )}
                  <h2>Complete your profile</h2>
                  <p className="auth-sub">Welcome, {pendingGoogleSession?.name}! Just a few more details.</p>
                </div>

                <label className="field">
                  <span>Date of birth</span>
                  <input
                    type="date"
                    required
                    value={googleProfileForm.dob}
                    onChange={(e) => setGoogleProfileForm((f) => ({ ...f, dob: e.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Weight (kg)</span>
                  <input
                    type="number"
                    min="20"
                    max="300"
                    step="0.1"
                    placeholder="e.g. 65"
                    required
                    value={googleProfileForm.weightKg}
                    onChange={(e) => setGoogleProfileForm((f) => ({ ...f, weightKg: e.target.value }))}
                  />
                </label>

                {authError && <p className="auth-error">{authError}</p>}

                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Saving..." : "Continue"}
                </button>
              </form>
            )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
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
