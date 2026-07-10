import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.js";
import { env } from "../config/env.js";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, phone, dob, weightKg, password } = req.body as {
      name?: string;
      phone?: string;
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

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      name: name.trim(),
      phone: phone.trim(),
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

// POST /api/auth/forgot-password — verify identity and return a short-lived reset token
router.post("/forgot-password", async (req, res) => {
  try {
    const { name, phone, dob } = req.body as {
      name?: string;
      phone?: string;
      dob?: string;
    };

    if (!name?.trim() || !phone?.trim() || !dob?.trim()) {
      res.status(400).json({ message: "Name, phone number, and date of birth are required." });
      return;
    }

    const user = await UserModel.findOne({ phone: phone.trim() });
    if (
      !user ||
      user.name.toLowerCase() !== name.trim().toLowerCase() ||
      user.dob !== dob.trim()
    ) {
      res.status(404).json({ message: "No account found matching those details." });
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

export { router as authRouter };
