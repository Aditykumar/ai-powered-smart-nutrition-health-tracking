import { Router } from "express";
import mongoose from "mongoose";

export const dbRouter = Router();

dbRouter.get("/atlas-ping", async (_req, res, next) => {
  try {
    const adminDb = mongoose.connection.db?.admin();

    if (!adminDb) {
      res.status(503).json({
        ok: false,
        connected: false,
        message: "Database is not connected yet",
      });
      return;
    }

    const result = await adminDb.ping();

    res.json({
      ok: true,
      connected: mongoose.connection.readyState === 1,
      ping: result,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
    });
  } catch (error) {
    next(error);
  }
});
