import mongoose from "mongoose";
import { env } from "./env.js";

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectDatabase() {
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.mongodbUri);
  }

  return connectionPromise;
}
