import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://adityakushwah29_db_user:TEy9P4WstsmAUnVP@cluster0.4rmkxv1.mongodb.net/nutrition_app?retryWrites=true&w=majority&appName=Cluster0";
const PHONE = "7037449337";

const analysis = {
  summary: "26-year-old male with early diabetes (HbA1c 6.6%), high LDL cholesterol (178 mg/dL), low HDL (36 mg/dL), and significantly elevated liver enzymes consistent with NAFLD. Kidney function is normal. Mild iron deficiency pattern noted.",
  keyFindings: [
    "HbA1c: 6.6% — Diabetes range (normal <5.7%)",
    "Average blood sugar: 143 mg/dL (elevated)",
    "LDL: 178 mg/dL — High (normal <100)",
    "HDL: 36 mg/dL — Low (normal >50)",
    "Total Cholesterol: 244 mg/dL — High (normal <200)",
    "Triglycerides: 150 mg/dL — Borderline",
    "ALT: 232 U/L — 4.6x above normal (normal <50)",
    "AST: 145 U/L — 3x above normal (normal 17–49)",
    "GGT: 106 U/L — High (normal 15–73)",
    "Hemoglobin: 13.4 g/dL — Normal",
    "Kidney function (Creatinine, eGFR, Urea) — Normal"
  ],
  flags: [
    "HbA1c in diabetes range — consult doctor within 1–2 weeks",
    "High LDL and Total Cholesterol — high cardiovascular risk",
    "Low HDL — increases cardiovascular risk",
    "Significantly elevated liver enzymes — possible NAFLD/fatty liver",
    "Mild iron deficiency pattern (low MCV, MCH, high RDW)"
  ],
  suggestedTargets: {
    calories: 1800,
    proteinG: 120,
    carbsG: 180,
    fatG: 55,
    fiberG: 35,
    sugarG: 25,
    sodiumMg: 1500
  },
  profileHints: {
    gender: "male",
    age: 26,
    activityLevel: "sedentary",
    goal: "weight_loss",
    healthConditions: ["diabetes", "high_cholesterol", "fatty_liver"],
    dietaryPreferences: ["vegetarian"]
  }
};

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db("nutrition_app");

  const user = await db.collection("users").findOne({ phone: PHONE });
  if (!user) { console.log("User not found for phone:", PHONE); await client.close(); process.exit(1); }
  console.log("Found user:", user._id.toString(), user.name);

  const userId = user._id.toString();
  const targetCalories = 1800;
  const macroTargets = { calories: 1800, proteinG: 120, carbsG: 180, fatG: 55, fiberG: 35, sugarG: 25, sodiumMg: 1500 };

  await db.collection("healthassessments").findOneAndUpdate(
    { userId },
    { $set: {
      userId,
      age: 26,
      heightCm: 168,
      weightKg: 90,
      gender: "male",
      activityLevel: "sedentary",
      goal: "weight_loss",
      healthConditions: ["diabetes", "high_cholesterol", "fatty_liver"],
      allergies: [],
      dietaryPreferences: ["vegetarian"],
      targetCalories,
      macroTargets,
      bloodReportAnalysis: analysis,
      profileSource: "blood-report",
      updatedAt: new Date()
    }},
    { upsert: true, returnDocument: "after" }
  );

  console.log("✅ Profile configured successfully for", user.name);
  console.log("   Target calories:", targetCalories);
  console.log("   Health conditions: diabetes, high_cholesterol, fatty_liver");
  console.log("   Goal: weight_loss | Diet: vegetarian");

  await client.close();
}

main().catch(console.error);
