import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../../lib/auth.js";
import PaymentClaim from "../../../../../models/PaymentClaim.js";
import AuditLog from "../../../../../models/AuditLog.js";
import { PaymentStatus, UserRole } from "../../../../../lib/constants.js";

export async function POST(req) {
  const mongooseInstance = await connectDB();
  const session = await mongooseInstance.startSession();

  try {
    const auth = await getAuthenticatedUser();
    if (!auth || auth.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { claimIds, reason } = await req.json();
    if (!Array.isArray(claimIds) || claimIds.length === 0 || !reason) {
      return NextResponse.json({ error: "claimIds array and rejection reason are required" }, { status: 400 });
    }

    session.startTransaction();

    const pendingClaims = await PaymentClaim.find({
      _id: { $in: claimIds },
      status: PaymentStatus.PENDING,
    }).session(session);

    if (pendingClaims.length === 0) {
      await session.abortTransaction();
      return NextResponse.json({ error: "No eligible pending claims found" }, { status: 404 });
    }

    const now = new Date();

    for (const claim of pendingClaims) {
      claim.status = PaymentStatus.REJECTED;
      claim.rejectionReason = reason;
      await claim.save({ session });

      await AuditLog.create(
        [
          {
            adminId: auth.userId,
            action: "REJECT_PAYMENT",
            targetId: claim._id,
            targetType: "PaymentClaim",
            details: { reason, cycle: claim.cycle, donorProfileId: claim.donorProfileId },
            timestamp: now,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();

    return NextResponse.json({
      success: true,
      rejectedCount: pendingClaims.length,
    });
  } catch (error) {
    await session.abortTransaction();
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}