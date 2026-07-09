import express from "express";
import cors from "cors";
import cron from "node-cron";
import { healthRouter } from "./routes/health.js";
import { mealsRouter } from "./routes/meals.js";
import { summaryRouter } from "./routes/summary.js";
import { dbRouter } from "./routes/db.js";
import { reportsRouter } from "./routes/reports.js";
import { activitiesRouter } from "./routes/activities.js";
import { emailRouter } from "./routes/email.js";
import { authRouter } from "./routes/auth.js";
import { foodsRouter } from "./routes/foods.js";
import { waterRouter } from "./routes/water.js";
import { bodyRouter } from "./routes/body.js";
import { templatesRouter } from "./routes/templates.js";
import { trendsRouter } from "./routes/trends.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { sendScheduledDailySummaries } from "./services/scheduler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

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
app.use("/api/email", emailRouter);
app.use("/api/foods", foodsRouter);
app.use("/api/water", waterRouter);
app.use("/api/body", bodyRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/trends", trendsRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  // Mongoose validation errors and cast errors → 400
  const isValidationError = error instanceof Error && (
    error.name === "ValidationError" ||
    error.name === "CastError" ||
    message.includes("validation failed") ||
    message.includes("Cast to")
  );
  res.status(isValidationError ? 400 : 500).json({ message });
});

async function bootstrap() {
  await connectDatabase();

  // Send daily email summaries at 8 PM every day
  cron.schedule("0 20 * * *", async () => {
    console.log("[Scheduler] Sending daily email summaries...");
    await sendScheduledDailySummaries();
  });

  app.listen(env.port, () => {
    console.log(`Nutrition API running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
