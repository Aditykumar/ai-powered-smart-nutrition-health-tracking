# AI-Powered Smart Nutrition & Health Tracking

A personalized nutrition and health tracking app with a React frontend, Node.js API, and MongoDB storage.

## What is included

- `apps/web`: React + Vite frontend
- `apps/api`: Node.js/Express API for assessments, meal logging, activity tracking, and summaries
- `packages/shared`: Shared TypeScript types and helpers
- `work/`: Scratch space for drafts or experiments
- `outputs/`: User-facing deliverables

## Features

- **Auth** — register with name, phone, date of birth, weight and password; log in with phone and password; forgot password verified by name + phone + DOB
- **Health assessment onboarding** — profile creation with goals, dietary preferences, and health data
- **Meal logging** — log meals with notes and photo support (base64)
- **Nutrition analysis** — review macro and micronutrient breakdowns
- **Activity tracking** — log workouts and daily movement
- **Daily summary** — AI-generated daily health recap
- **WhatsApp summaries** — send your daily summary via WhatsApp Business API
- **Reports** — weekly/monthly health reports

## Navigation

The top navbar links to:
- **Assessment** — health profile onboarding
- **Features** — meal logging section
- **Activity** — activity log
- **Learn** — daily summary section

**Log In** and **Sign Up** both scroll to the assessment/profile creation form. Full auth (Google, Apple, email, OTP) is not yet implemented — see next steps below.

## Local development

Install dependencies in each package, then run from the root:

```bash
npm run dev
```

This starts both the web app and API together.

- Web: `http://localhost:5173`
- API: `http://localhost:4000`

## Environment variables

Copy `apps/api/.env.example` to `apps/api/.env` and fill in the values:

```env
PORT=4000
MONGODB_URI=...
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TO_NUMBER=
```

## MongoDB setup

- Copy `apps/api/.env.example` to `apps/api/.env`
- Set `MONGODB_URI` to your MongoDB Atlas connection string
- Allow your IP in Atlas Network Access
- Create a database user in Atlas and use those credentials in the URI
- Example URI: `mongodb+srv://<user>:<password>@cluster0.4rmkxv1.mongodb.net/nutrition_app?retryWrites=true&w=majority&appName=Cluster0`

### Atlas connection checklist

1. Open MongoDB Atlas and select your cluster.
2. Go to **Database Access** and confirm your user exists with the correct password.
3. URL-encode the password if it contains special characters.
4. Go to **Network Access** and add your current IP address.
5. Paste the SRV URI into `apps/api/.env` as `MONGODB_URI`.
6. Start the API with `npm run dev`.
7. Open `http://localhost:4000/api/db/atlas-ping` to confirm the connection.

### Optional local MongoDB

```bash
docker compose up -d
# Then set:
MONGODB_URI=mongodb://nutrition:nutrition@localhost:27017/nutrition_app?authSource=admin
```

## WhatsApp summaries

Set these three variables in `apps/api/.env`:

```env
WHATSAPP_ACCESS_TOKEN=   # your Meta access token
WHATSAPP_PHONE_NUMBER_ID= # your WhatsApp Business phone number ID
WHATSAPP_TO_NUMBER=      # recipient number in E.164 format, e.g. +1234567890
```

Then restart the API and use the **WhatsApp Daily Summary** card in the app. If the credentials are missing, the app will tell you exactly which variables to set.

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Health check |
| GET | `/api/db/atlas-ping` | MongoDB connection check |
| POST | `/api/auth/register` | Register with name, phone, DOB, weight, password |
| POST | `/api/auth/login` | Login with phone + password → JWT |
| POST | `/api/auth/forgot-password` | Verify identity (name + phone + DOB) → reset token |
| POST | `/api/auth/reset-password` | Reset password using reset token |
| POST | `/api/health/assessment` | Save health assessment |
| GET | `/api/meals` | List meals |
| POST | `/api/meals` | Log a meal |
| GET | `/api/activities` | List activities |
| POST | `/api/activities` | Log an activity |
| GET | `/api/summary` | Get daily summary |
| POST | `/api/whatsapp/send` | Send WhatsApp summary |
| GET | `/api/reports` | Get health reports |

## Suggested next steps

1. **Add OTP / social auth** — layer Google, Apple, or SMS OTP on top of the existing phone+password auth.
2. **Food recognition** — connect OpenAI Vision or Gemini for image-based meal identification.
3. **Nutrient database** — wire USDA FoodData Central or Nutritionix for accurate macro/micronutrient data.
4. **AI recommendations** — use OpenAI or Gemini to generate personalized meal and workout suggestions.
5. **Push notifications** — daily reminder to log meals or review the summary.
