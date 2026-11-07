import mongoose from "mongoose";
import { PaymentStatus } from "../lib/constants.js";

const PaymentClaimSchema = new mongoose.Schema({
  donorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "DonorProfile", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  cycle: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  shares: { type: Number, required: true },
  status: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING, index: true },
  transactionId: { type: String, sparse: true, unique: true },
  rejectionReason: { type: String },
  submittedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

PaymentClaimSchema.index(
  { donorProfileId: 1, cycle: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [PaymentStatus.PENDING, PaymentStatus.PAID] } },
  }
);

export default mongoose.models.PaymentClaim || mongoose.model("PaymentClaim", PaymentClaimSchema);