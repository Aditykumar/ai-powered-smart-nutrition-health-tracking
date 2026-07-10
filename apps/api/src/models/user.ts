import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    dob: { type: String, required: true }, // YYYY-MM-DD
    weightKg: { type: Number, required: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const UserModel = model("User", userSchema);
