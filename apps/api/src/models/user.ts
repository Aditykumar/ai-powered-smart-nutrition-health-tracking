import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    name:         { type: String, required: true },
    email:        { type: String, sparse: true, unique: true, lowercase: true, trim: true },
    phone:        { type: String, sparse: true, unique: true },   // optional for Google users
    dob:          { type: String },                                // YYYY-MM-DD, set later if missing
    weightKg:     { type: Number },
    passwordHash: { type: String },                                // absent for Google-only users
    googleId:     { type: String, sparse: true, unique: true },
    picture:      { type: String },                                // Google profile photo URL
  },
  { timestamps: true },
);

export const UserModel = model("User", userSchema);
