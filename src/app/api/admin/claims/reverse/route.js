import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../../lib/auth.js";
import PaymentClaim from "../../../../../models/PaymentClaim.js";
import CampaignStats from "../../../../../models/CampaignStats.js";
import AuditLog from "../../../../../models/AuditLog.js";
import { PaymentStatus, UserRole } from "../../../../../lib/constants.js";

// Reverses an accidentally verified payment record back to REJECTED
export async function POST(req) {
  const mongooseInstance = await connectDB();
  const session = await mongooseInstance.startSession();

  try {
    const auth = await getAuthenticatedUser();
    if (!auth || auth.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { claimId, reason } = await req.json();
    if (!claimId || !reason) {
      return NextResponse.json({ error: "claimId and reversal reason are required" }, { status: 400 });
    }

    session.startTransaction();

    const claim = await PaymentClaim.findOne({ _id: claimId, status: PaymentStatus.PAID }).session(session);
    if (!claim) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Eligible paid claim not found" }, { status: 404 });
    }

    claim.status = PaymentStatus.REJECTED;
    claim.rejectionReason = `REVERSED: ${reason}`;
    await claim.save({ session });

    // Deduct verified amount from global realized revenue
    await CampaignStats.updateOne(
      { _id: "global" },
      { $inc: { totalRealizedRevenue: -claim.amount } },
      { session }
    );

    // Audit log the reversal
    await AuditLog.create(
      [
        {
          adminId: auth.userId,
          action: "REVERSE_VERIFIED_PAYMENT",
          targetId: claim._id,
          targetType: "PaymentClaim",
          details: { reversedAmount: claim.amount, reason },
          timestamp: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return NextResponse.json({ success: true, message: "Payment reversed successfully" });
  } catch (error) {
    await session.abortTransaction();
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}