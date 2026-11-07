import mongoose from "mongoose";
import { UserRole } from "../lib/constants.js";

const UserSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.DONOR },
  resetOtp: { type: String },
  resetOtpExpires: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);