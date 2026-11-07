import { NextResponse } from "next/server";
import { connectDB } from "../../../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../../../lib/auth.js";
import DonorProfile from "../../../../../../models/DonorProfile.js";
import CampaignStats from "../../../../../../models/CampaignStats.js";
import { CAMPAIGN_CONFIG, ProfileStatus } from "../../../../../../lib/constants.js";

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

    if (profile.status === ProfileStatus.ACTIVE) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Profile is already active" }, { status: 400 });
    }

    // Verify share capacity before reactivating
    const stats = await CampaignStats.findById("global").session(session);
    if (stats.totalPledgedShares + profile.shares > CAMPAIGN_CONFIG.TOTAL_SHARES) {
      await session.abortTransaction();
      return NextResponse.json(
        { error: "Cannot reactivate: Campaign is at maximum share capacity" },
        { status: 400 }
      );
    }

    stats.totalPledgedShares += profile.shares;
    stats.updatedAt = new Date();
    await stats.save({ session });

    profile.status = ProfileStatus.ACTIVE;
    profile.effectiveDeactivationCycle = undefined;
    await profile.save({ session });

    await session.commitTransaction();

    return NextResponse.json({
      success: true,
      message: "Profile reactivated successfully for current cycle",
      profile,
    });
  } catch (error) {
    await session.abortTransaction();
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}