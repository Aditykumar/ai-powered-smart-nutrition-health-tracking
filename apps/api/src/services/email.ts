import nodemailer from "nodemailer";
import { env } from "../config/env.js";

function createTransporter() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) return null;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
}

const APP = "NutriCore";
const from = () => `"${APP}" <${env.smtpUser}>`;

// ── Welcome email ───────────────────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const t = createTransporter();
  if (!t) { console.log(`[Email] Welcome → ${to} (no SMTP configured)`); return; }

  await t.sendMail({
    from: from(), to,
    subject: `Welcome to ${APP}, ${name}!`,
    html: `
<div style="font-family:Inter,sans-serif;max-width:540px;margin:0 auto;background:#f8fafc;padding:32px 24px;border-radius:16px;">
  <div style="background:linear-gradient(135deg,#f97316,#ea580c,#16a34a);border-radius:14px;padding:28px;text-align:center;margin-bottom:28px;">
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;">Welcome to NutriCore!</h1>
    <p style="color:rgba(255,255,255,.85);margin:10px 0 0;font-size:15px;">Your AI-powered nutrition journey begins today</p>
  </div>
  <p style="color:#334155;font-size:16px;margin-bottom:24px;">Hi <strong>${name}</strong>, you're all set. Here's how to get started:</p>
  <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px;">
    ${[
      ["📊","Complete your health assessment","Set age, weight, goals and health conditions for personalised targets"],
      ["🍽️","Log your first meal","Use AI food photo analysis or search 500k+ foods"],
      ["💧","Track your water intake","Log glasses and see your hydration ring fill up"],
      ["📈","View weekly trends","Charts and streaks to keep you motivated"],
      ["📧","Daily email summaries","Get your nutrition report sent to this inbox every day"],
    ].map(([icon, title, desc]) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;display:flex;gap:14px;align-items:flex-start;">
      <span style="font-size:22px;flex-shrink:0;">${icon}</span>
      <div><strong style="color:#0f172a;display:block;font-size:14px;margin-bottom:2px;">${title}</strong><span style="color:#64748b;font-size:13px;">${desc}</span></div>
    </div>`).join("")}
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;">© ${new Date().getFullYear()} ${APP} — AI-Powered Smart Nutrition Tracking</p>
</div>`,
  });
  console.log(`[Email] Welcome sent → ${to}`);
}

// ── Daily summary email ─────────────────────────────────────────────────────
export async function sendDailySummaryEmail({
  to,
  name,
  date,
  consumed,
  targets,
  meals,
  activityBurn,
  score,
  recommendations,
}: {
  to: string;
  name: string;
  date: string;
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number };
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  meals: { name: string; quantity: string; calories: number }[];
  activityBurn: number;
  score: number;
  recommendations: string[];
}): Promise<{ sent: boolean; reason?: string; preview: string }> {
  const pct = Math.min(100, Math.round((consumed.calories / targets.calories) * 100));
  const netCal = Math.round(consumed.calories - activityBurn);
  const mealList = meals.length
    ? meals.map((m) => `${m.name} (${m.quantity}) — ${Math.round(m.calories)} kcal`).join("\n")
    : "No meals logged today";

  const preview = [
    `NutriCore Daily Summary — ${date}`,
    `Calories: ${Math.round(consumed.calories)} / ${Math.round(targets.calories)} kcal (${pct}%)`,
    `Protein: ${Math.round(consumed.proteinG)}g  Carbs: ${Math.round(consumed.carbsG)}g  Fat: ${Math.round(consumed.fatG)}g`,
    `Activity burn: ${Math.round(activityBurn)} kcal  Net: ${netCal} kcal`,
    `Score: ${score}/100`,
    recommendations[0] ? `Tip: ${recommendations[0]}` : "",
  ].filter(Boolean).join("\n");

  const t = createTransporter();
  if (!t) {
    console.log(`[Email] Daily summary preview (no SMTP):\n${preview}`);
    return { sent: false, reason: "SMTP not configured — add SMTP_HOST/USER/PASS to .env", preview };
  }

  const scoreColor = score >= 75 ? "#16a34a" : score >= 50 ? "#ea580c" : "#dc2626";
  const pctBar = Math.min(100, pct);

  await t.sendMail({
    from: from(), to,
    subject: `${APP} Daily Summary — ${date} · Score ${score}/100`,
    html: `
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:32px 24px;border-radius:16px;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#f97316,#ea580c);border-radius:14px;padding:24px 28px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">${APP}</h1>
      <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:13px;">Daily Nutrition Report — ${date}</p>
    </div>
    <div style="background:rgba(255,255,255,.2);border-radius:50%;width:56px;height:56px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;">
      <strong style="color:#fff;font-size:18px;line-height:1;">${score}</strong>
      <span style="color:rgba(255,255,255,.8);font-size:10px;">/100</span>
    </div>
  </div>
  <p style="color:#334155;font-size:15px;margin-bottom:20px;">Hi <strong>${name}</strong>, here's your nutrition report for today.</p>

  <!-- Calorie bar -->
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong style="color:#0f172a;font-size:15px;">Calories</strong>
      <span style="color:#ea580c;font-weight:700;font-size:16px;">${Math.round(consumed.calories)} <span style="color:#94a3b8;font-weight:400;">/ ${Math.round(targets.calories)} kcal</span></span>
    </div>
    <div style="background:#f1f5f9;border-radius:99px;height:8px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#fb923c,#ea580c);width:${pctBar}%;height:100%;border-radius:99px;"></div>
    </div>
    <p style="color:#64748b;font-size:13px;margin:8px 0 0;">${pct}% of daily goal · Activity burn: ${Math.round(activityBurn)} kcal · Net: ${netCal} kcal</p>
  </div>

  <!-- Macros -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
    ${[
      ["Protein", `${Math.round(consumed.proteinG)}g`, `/ ${Math.round(targets.proteinG)}g`, "#f97316"],
      ["Carbs",   `${Math.round(consumed.carbsG)}g`,   `/ ${Math.round(targets.carbsG)}g`,   "#22c55e"],
      ["Fat",     `${Math.round(consumed.fatG)}g`,     `/ ${Math.round(targets.fatG)}g`,     "#3b82f6"],
    ].map(([label, val, target, color]) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center;">
      <span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">${label}</span>
      <div style="font-size:17px;font-weight:800;color:${color};margin:4px 0 2px;">${val}</div>
      <div style="font-size:11px;color:#94a3b8;">${target}</div>
    </div>`).join("")}
  </div>

  <!-- Meals -->
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
    <strong style="color:#0f172a;font-size:14px;display:block;margin-bottom:10px;">Meals logged</strong>
    ${meals.length
      ? meals.map((m) => `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
      <span style="color:#334155;">${m.name} <span style="color:#94a3b8;">(${m.quantity})</span></span>
      <span style="color:#ea580c;font-weight:700;">${Math.round(m.calories)} kcal</span>
    </div>`).join("")
      : `<p style="color:#94a3b8;font-size:13px;margin:0;">No meals logged today.</p>`}
  </div>

  <!-- Score badge -->
  <div style="background:#fff;border:1.5px solid ${scoreColor};border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;margin-bottom:16px;">
    <div style="width:44px;height:44px;border-radius:50%;background:${scoreColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <strong style="color:#fff;font-size:16px;">${score}</strong>
    </div>
    <div>
      <strong style="color:#0f172a;font-size:14px;display:block;">${score >= 75 ? "Great day!" : score >= 50 ? "Good effort" : "Keep going"}</strong>
      <span style="color:#64748b;font-size:13px;">${recommendations[0] ?? "Log meals consistently to improve your score."}</span>
    </div>
  </div>

  <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px;">© ${new Date().getFullYear()} ${APP} — You're receiving this because you enabled daily summaries.</p>
</div>`,
  });

  console.log(`[Email] Daily summary sent → ${to}`);
  return { sent: true, preview };
}

// ── Password reset ──────────────────────────────────────────────────────────
export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const t = createTransporter();
  if (!t) { console.log(`[Email] Reset token for ${to}: ${resetToken}`); return; }
  await t.sendMail({
    from: from(), to,
    subject: `${APP} — Password Reset`,
    html: `
<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;padding:32px 24px;border-radius:16px;">
  <h2 style="color:#0f172a;margin-bottom:8px;">Password Reset</h2>
  <p style="color:#64748b;line-height:1.7;margin-bottom:20px;">You requested a password reset. Use the token below — it expires in 15 minutes.</p>
  <div style="background:#fff;border:2px solid #fed7aa;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
    <p style="color:#ea580c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Reset Token</p>
    <code style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:.12em;">${resetToken}</code>
  </div>
  <p style="color:#94a3b8;font-size:12px;">If you didn't request this, ignore this email — your account is safe.</p>
</div>`,
  });
  console.log(`[Email] Password reset sent → ${to}`);
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transporter = createTransporter();
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
      <h2 style="color:#f97316;margin:0 0 8px;">Password Reset OTP</h2>
      <p style="color:#64748b;margin:0 0 24px;">Use this one-time code to reset your NutriCore password. It expires in <strong>10 minutes</strong>.</p>
      <div style="background:#fff7ed;border:2px solid #fed7aa;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
        <span style="font-size:2.5rem;font-weight:900;letter-spacing:8px;color:#ea580c;">${otp}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;">If you didn't request this, ignore this email — your account is safe.</p>
    </div>`;

  if (!transporter) {
    console.log(`[Email] OTP for ${to}: ${otp}`);
    return;
  }
  await transporter.sendMail({
    from: `"NutriCore" <${env.smtpUser}>`,
    to,
    subject: `Your NutriCore OTP: ${otp}`,
    html,
  });
}
