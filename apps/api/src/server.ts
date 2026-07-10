import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { mealsRouter } from "./routes/meals.js";
import { summaryRouter } from "./routes/summary.js";
import { dbRouter } from "./routes/db.js";
import { reportsRouter } from "./routes/reports.js";
import { activitiesRouter } from "./routes/activities.js";
import { whatsappRouter } from "./routes/whatsapp.js";
import { authRouter } from "./routes/auth.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.options("*", cors());
app.use(express.json({ limit: "25mb" }));

// Lazy DB connect — works for both serverless (Vercel) and long-running server
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (err) {
    next(err);
  }
});

app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    service: "nutrition-api",
    database: "mongodb",
    version: "0.2.0",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/summary", summaryRouter);
app.use("/api/db", dbRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/whatsapp", whatsappRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ message });
});

// Export for Vercel serverless
export default app;

// Local development only — not executed on Vercel
if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    console.log(`Nutrition API running on http://localhost:${env.port}`);
  });
}
