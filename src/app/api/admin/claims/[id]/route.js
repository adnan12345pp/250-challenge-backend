import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../../lib/auth.js";
import PaymentClaim from "../../../../../models/PaymentClaim.js";
import CampaignStats from "../../../../../models/CampaignStats.js";
import AuditLog from "../../../../../models/AuditLog.js";
import { PaymentStatus, UserRole } from "../../../../../lib/constants.js";

export async function PATCH(req, context) {
  const mongooseInstance = await connectDB();
  const session = await mongooseInstance.startSession();

  try {
    const auth = await getAuthenticatedUser();
    if (!auth || auth.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid claim ID" }, { status: 400 });
    }

    const { status, reason } = await req.json();
    if (status !== "VERIFIED" && status !== PaymentStatus.REJECTED) {
      return NextResponse.json({ error: "Status must be VERIFIED or REJECTED" }, { status: 400 });
    }

    session.startTransaction();

    const claim = await PaymentClaim.findOne({
      _id: id,
      status: PaymentStatus.PENDING,
    }).session(session);

    if (!claim) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Pending claim not found" }, { status: 404 });
    }

    const now = new Date();
    const isVerified = status === "VERIFIED";
    claim.status = isVerified ? PaymentStatus.PAID : PaymentStatus.REJECTED;

    if (isVerified) {
      claim.verifiedAt = now;
      claim.verifiedBy = auth.userId;
      await CampaignStats.updateOne(
        { _id: "global" },
        { $inc: { totalRealizedRevenue: claim.amount }, $set: { updatedAt: now } },
        { session }
      );
    } else {
      claim.rejectionReason = reason?.trim() || "Rejected by admin";
    }

    await claim.save({ session });
    await AuditLog.create(
      [
        {
          adminId: auth.userId,
          action: isVerified ? "VERIFY_PAYMENT" : "REJECT_PAYMENT",
          targetId: claim._id,
          targetType: "PaymentClaim",
          details: {
            amount: claim.amount,
            cycle: claim.cycle,
            donorProfileId: claim.donorProfileId,
            ...(isVerified ? {} : { reason: claim.rejectionReason }),
          },
          timestamp: now,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return NextResponse.json({ success: true, claim });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}
