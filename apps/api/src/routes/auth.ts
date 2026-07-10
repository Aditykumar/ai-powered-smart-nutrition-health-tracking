import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.js";
import { env } from "../config/env.js";
import { sendWelcomeEmail, sendOtpEmail } from "../services/email.js";

// In-memory OTP store: email -> { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, phone, email, dob, weightKg, password } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      dob?: string;
      weightKg?: number;
      password?: string;
    };

    if (!name?.trim() || !phone?.trim() || !dob?.trim() || !weightKg || !password) {
      res.status(400).json({ message: "All fields are required." });
      return;
    }

    const existing = await UserModel.findOne({ phone: phone.trim() });
    if (existing) {
      res.status(409).json({ message: "Phone number is already registered." });
      return;
    }

    if (email?.trim()) {
      const emailExists = await UserModel.findOne({ email: email.trim().toLowerCase() });
      if (emailExists) {
        res.status(409).json({ message: "Email address is already registered." });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim().toLowerCase() || undefined,
      dob: dob.trim(),
      weightKg: Number(weightKg),
      passwordHash,
    });

    const token = jwt.sign(
      { userId: user._id.toString(), name: user.name },
      env.jwtSecret,
      { expiresIn: "30d" },
    );

    res.json({ token, userId: user._id.toString(), name: user.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    res.status(500).json({ message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body as { phone?: string; password?: string };

    if (!phone?.trim() || !password) {
      res.status(400).json({ message: "Phone and password are required." });
      return;
    }

    const user = await UserModel.findOne({ phone: phone.trim() });
    if (!user) {
      res.status(401).json({ message: "Invalid phone number or password." });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({ message: "This account uses Google sign-in. Please log in with Google." });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: "Invalid phone number or password." });
      return;
    }

    const token = jwt.sign(
      { userId: user._id.toString(), name: user.name },
      env.jwtSecret,
      { expiresIn: "30d" },
    );

    res.json({ token, userId: user._id.toString(), name: user.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    res.status(500).json({ message });
  }
});

// POST /api/auth/forgot-password — send a verification code to the account's email
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email?.trim()) {
      res.status(400).json({ message: "Email address is required." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      // Don't reveal whether the email exists
      res.json({ sent: true });
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(normalizedEmail, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    await sendOtpEmail(normalizedEmail, otp);

    res.json({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send verification code";
    res.status(500).json({ message });
  }
});

// POST /api/auth/verify-otp — verify the emailed code and return a short-lived reset token
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };

    if (!email?.trim() || !otp?.trim()) {
      res.status(400).json({ message: "Email and verification code are required." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = otpStore.get(normalizedEmail);
    if (!record || record.otp !== otp.trim() || Date.now() > record.expiresAt) {
      res.status(401).json({ message: "Invalid or expired code." });
      return;
    }

    otpStore.delete(normalizedEmail);

    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(404).json({ message: "Account not found." });
      return;
    }

    const resetToken = jwt.sign(
      { userId: user._id.toString(), purpose: "reset" },
      env.jwtSecret,
      { expiresIn: "15m" },
    );

    res.json({ resetToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    res.status(500).json({ message });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body as {
      resetToken?: string;
      newPassword?: string;
    };

    if (!resetToken || !newPassword) {
      res.status(400).json({ message: "Reset token and new password are required." });
      return;
    }

    let payload: { userId: string; purpose: string };
    try {
      payload = jwt.verify(resetToken, env.jwtSecret) as { userId: string; purpose: string };
    } catch {
      res.status(401).json({ message: "Reset link has expired. Please request a new one." });
      return;
    }

    if (payload.purpose !== "reset") {
      res.status(401).json({ message: "Invalid reset token." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await UserModel.findByIdAndUpdate(payload.userId, { passwordHash });

    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password reset failed";
    res.status(500).json({ message });
  }
});

// POST /api/auth/google — verify Google credential, create/find user
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body as { credential?: string };

    if (!credential) {
      res.status(400).json({ message: "Google credential required." });
      return;
    }

    if (!env.googleClientId) {
      res.status(503).json({ message: "Google auth is not configured on this server." });
      return;
    }

    const { OAuth2Client } = await import("google-auth-library");
    const client = new OAuth2Client(env.googleClientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    const payload = ticket.getPayload();

    if (!payload) {
      res.status(401).json({ message: "Invalid Google token." });
      return;
    }

    // Find existing user by googleId or email
    let user = await UserModel.findOne({ googleId: payload.sub });
    if (!user && payload.email) {
      user = await UserModel.findOne({ email: payload.email.toLowerCase() });
    }

    if (!user) {
      // New Google user — create account (DOB and weight collected in frontend follow-up step)
      user = await UserModel.create({
        name: payload.name ?? "User",
        email: payload.email?.toLowerCase(),
        googleId: payload.sub,
        picture: payload.picture,
      });

      if (user.email) {
        sendWelcomeEmail(user.email, user.name).catch((err) =>
          console.error("[Email] Failed to send welcome email:", err),
        );
      }
    } else if (!user.googleId) {
      // Existing email user — link Google account
      await UserModel.findByIdAndUpdate(user._id, { googleId: payload.sub, picture: payload.picture });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), name: user.name },
      env.jwtSecret,
      { expiresIn: "30d" },
    );

    const needsProfile = !user.dob || !user.weightKg;

    res.json({
      token,
      userId: user._id.toString(),
      name: user.name,
      picture: user.picture ?? payload.picture,
      needsProfile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google authentication failed";
    res.status(500).json({ message });
  }
});

// POST /api/auth/update-profile — patch dob/weightKg for Google users after signup
router.post("/update-profile", async (req, res) => {
  try {
    const { userId, dob, weightKg } = req.body as { userId?: string; dob?: string; weightKg?: number };
    if (!userId?.match(/^[a-f\d]{24}$/i)) {
      res.status(400).json({ message: "Invalid userId." });
      return;
    }
    await UserModel.findByIdAndUpdate(userId, {
      ...(dob ? { dob } : {}),
      ...(weightKg ? { weightKg: Number(weightKg) } : {}),
    });
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    res.status(500).json({ message });
  }
});

export { router as authRouter };
