import { NextResponse } from "next/server";
import { connectDB } from "../../../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../../../lib/auth.js";
import DonorProfile from "../../../../../../models/DonorProfile.js";
import PaymentClaim from "../../../../../../models/PaymentClaim.js";
import CampaignStats from "../../../../../../models/CampaignStats.js";
import { PaymentStatus, ProfileStatus } from "../../../../../../lib/constants.js";
import { getCurrentCycle, getNextCycle } from "../../../../../../lib/date.js";

export async function POST(req, { params }) {
  const { id } = await params;
  const mongooseInstance = await connectDB();
  const session = await mongooseInstance.startSession();

  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    session.startTransaction();

    const profile = await DonorProfile.findOne({ _id: id, userId: auth.userId }).session(session);
    if (!profile) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.status === ProfileStatus.DEACTIVATED) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Profile is already deactivated" }, { status: 400 });
    }

    const currentCycle = getCurrentCycle();

    const currentClaim = await PaymentClaim.findOne({
      donorProfileId: profile._id,
      cycle: currentCycle,
    })
      .sort({ submittedAt: -1 })
      .session(session);

    if (currentClaim && currentClaim.status === PaymentStatus.PENDING) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: "Deactivation blocked: You have a payment claim awaiting Admin verification" },
        { status: 400 }
      );
    }

    if (currentClaim && currentClaim.status === PaymentStatus.PAID) {
      profile.status = ProfileStatus.PENDING_DEACTIVATION;
      profile.effectiveDeactivationCycle = getNextCycle();
      await profile.save({ session });
      await session.commitTransaction();

      return NextResponse.json({
        message: "Current month is verified. Deactivation takes effect next cycle.",
        effectiveCycle: profile.effectiveDeactivationCycle,
        status: profile.status,
      });
    }

    profile.status = ProfileStatus.DEACTIVATED;
    profile.effectiveDeactivationCycle = currentCycle;
    await profile.save({ session });

    await CampaignStats.updateOne(
      { _id: "global" },
      { $inc: { totalPledgedShares: -profile.shares } },
      { session }
    );

    await session.commitTransaction();

    return NextResponse.json({
      message: "Profile deactivated for current month. Committed shares released.",
      effectiveCycle: currentCycle,
      status: profile.status,
    });
  } catch (error) {
    await session.abortTransaction();
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}