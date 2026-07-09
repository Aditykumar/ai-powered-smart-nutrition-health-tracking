# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (run both api + web together)
npm run dev

# Run individually
npm run dev:api    # API on http://localhost:4000
npm run dev:web    # Web on http://localhost:5173

# Build all packages
npm run build

# Local MongoDB (Docker)
docker compose up -d

# Verify MongoDB connection
curl http://localhost:4000/api/db/atlas-ping
```

No test runner is configured. No linter is configured (lint scripts are stubs).

## Architecture

This is an **npm workspaces monorepo**:
- `apps/api` — Node.js/Express REST API (TypeScript, runs via `tsx` — no compile step needed in dev)
- `apps/web` — React 18 + Vite SPA (TypeScript)
- `packages/shared` — shared TypeScript types (`UserProfile`, `NutrientBreakdown`, `DailySummary`, etc.) and nutrition math helpers exported by both apps

### API (`apps/api/src/`)

**Entry point:** `server.ts` — connects MongoDB, registers all routers, schedules midnight WhatsApp cron via `node-cron`.

**Route → file mapping:**
- `/api/auth` → `routes/auth.ts` — register/login/forgot-password/reset-password using bcryptjs + JWT
- `/api/health` → `routes/health.ts` — upsert health assessment, compute calorie/macro targets
- `/api/meals` → `routes/meals.ts` — list meals, log manually, or analyze a food photo via Gemini
- `/api/activities` → `routes/activities.ts` — analyze step count or activity screenshot via Gemini
- `/api/summary/:date` → `routes/summary.ts` — aggregate daily nutrition totals + compute score (0–100)
- `/api/reports/blood` → `routes/reports.ts` — accept PDF/image blood report → Gemini analysis → upsert health assessment
- `/api/whatsapp/daily-summary` → `routes/whatsapp.ts` — build and send summary via Twilio
- `/api/db/atlas-ping` → `routes/db.ts` — MongoDB connectivity check
- `routes/coach.ts` exists but is **not mounted** in `server.ts` (dead file)

**AI service** (`services/ai.ts`): all inference through **Gemini 1.5 Flash** via direct REST. Three exported functions: `analyzeFoodPhoto`, `analyzeActivity`, `analyzeBloodReport`. Each has a formula-based fallback when `GEMINI_API_KEY` is absent. PDFs are text-extracted with `pdf-parse` before being sent to Gemini.

**WhatsApp** (`services/whatsapp.ts`): uses **Twilio** (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`), not the Meta WhatsApp Business API. The README mentions Meta env vars — ignore that; the actual service uses Twilio.

**Auth is not enforced on routes.** JWT is issued at login/register but no middleware validates it. `userId` is taken from `req.body.userId` or the `x-user-id` header — all routes are effectively public.

**Nutrition math** (`utils/nutrition.ts`): Mifflin-St Jeor BMR × activity multiplier, with ±350/250 kcal adjustments for goal. This logic is duplicated in `packages/shared/src/nutrition.ts` — keep them in sync if changing either.

### Frontend (`apps/web/src/`)

The entire UI lives in a single **`App.tsx`** file (~72 KB). There is no routing library — sections are toggled via component state. It imports types from `@nutrition/shared` and calls the API at `VITE_API_BASE_URL` (defaults to `http://localhost:4000`).

### Shared package (`packages/shared/src/`)

- `index.ts` — all exported types (`UserProfile`, `Gender`, `ActivityLevel`, `Goal`, `HealthCondition`, `DietaryPreference`, `NutrientBreakdown`, `FoodEntry`, `DailySummary`)
- `nutrition.ts` — `estimateDailyCalories()` and `getMacroTargets()`

### Environment variables (`apps/api/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas or local URI |
| `JWT_SECRET` | Yes (has insecure default) | JWT signing |
| `PORT` | No (default 4000) | API port |
| `GEMINI_API_KEY` | No | Food/activity/blood AI analysis |
| `TWILIO_ACCOUNT_SID` | No | WhatsApp sending |
| `TWILIO_AUTH_TOKEN` | No | WhatsApp sending |
| `WHATSAPP_TO_NUMBER` | No | Default recipient (E.164 format) |

Copy `apps/api/.env.example` to `apps/api/.env`. The example file contains a placeholder Atlas URI — replace with real credentials.
