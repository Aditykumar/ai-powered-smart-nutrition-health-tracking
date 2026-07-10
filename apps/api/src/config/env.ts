import fs from "node:fs";
import path from "node:path";

function loadEnvFile() {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/api/.env"),
  ];

  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, equalsIndex).replace(/^export\s+/, "").trim();
      const rawValue = trimmed.slice(equalsIndex + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    return;
  }
}

loadEnvFile();

const required = (value: string | undefined, message: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
};

export const env = {
  port: Number(process.env.PORT ?? 4000),
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  mongodbUri: required(
    process.env.MONGODB_URI,
    "MONGODB_URI is required. Set it to your MongoDB Atlas connection string or a local MongoDB URI.",
  ),
  jwtSecret: process.env.JWT_SECRET?.trim() || "nutrition-app-default-secret-change-in-production",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "",
  whatsappToNumber: process.env.WHATSAPP_TO_NUMBER?.trim() || "",
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
  usdaApiKey: process.env.USDA_API_KEY?.trim() || "",
  // Email — free options: Brevo (smtp-relay.brevo.com:587) or Gmail (smtp.gmail.com:587)
  smtpHost: process.env.SMTP_HOST?.trim() || "",
  smtpPort: Number(process.env.SMTP_PORT?.trim() || 587),
  smtpUser: process.env.SMTP_USER?.trim() || "",
  smtpPass: process.env.SMTP_PASS?.trim() || "",
};
