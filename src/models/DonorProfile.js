import mongoose from "mongoose";
import { ProfileStatus } from "../lib/constants.js";

const DonorProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  fullName: { type: String, required: true, trim: true },
  careOf: { type: String, trim: true },
  shares: { type: Number, required: true, min: 1 },
  status: { type: String, enum: Object.values(ProfileStatus), default: ProfileStatus.ACTIVE },
  effectiveDeactivationCycle: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.DonorProfile || mongoose.model("DonorProfile", DonorProfileSchema);