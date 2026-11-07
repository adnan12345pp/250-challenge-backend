import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../../lib/auth.js";
import DonorProfile from "../../../../../models/DonorProfile.js";
import MonthlySnapshot from "../../../../../models/MonthlySnapshot.js";
import CampaignStats from "../../../../../models/CampaignStats.js";
import { CAMPAIGN_CONFIG, ProfileStatus, UserRole } from "../../../../../lib/constants.js";
import { getCurrentCycle } from "../../../../../lib/date.js";

export async function POST() {
  const mongooseInstance = await connectDB();
  const session = await mongooseInstance.startSession();

  try {
    const auth = await getAuthenticatedUser();
    if (!auth || auth.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const currentCycle = getCurrentCycle();

    session.startTransaction();

    const existingSnapshot = await MonthlySnapshot.findOne({ cycle: currentCycle }).session(session);
    if (existingSnapshot) {
      await session.abortTransaction();
      return NextResponse.json({ error: `Snapshot for ${currentCycle} already initialized` }, { status: 400 });
    }

    // Process profiles with pending deactivations
    const pendingDeactivations = await DonorProfile.find({
      status: ProfileStatus.PENDING_DEACTIVATION,
      effectiveDeactivationCycle: currentCycle,
    }).session(session);

    let releasedShares = 0;
    for (const profile of pendingDeactivations) {
      profile.status = ProfileStatus.DEACTIVATED;
      await profile.save({ session });
      releasedShares += profile.shares;
    }

    if (releasedShares > 0) {
      await CampaignStats.updateOne(
        { _id: "global" },
        { $inc: { totalPledgedShares: -releasedShares } },
        { session }
      );
    }

    // Aggregate active commitments
    const activeProfiles = await DonorProfile.find({ status: ProfileStatus.ACTIVE }).session(session);
    const totalCommittedShares = activeProfiles.reduce((acc, p) => acc + p.shares, 0);

    const snapshot = await MonthlySnapshot.create(
      [
        {
          cycle: currentCycle,
          targetAmount: CAMPAIGN_CONFIG.MONTHLY_TARGET,
          totalActiveProfiles: activeProfiles.length,
          totalCommittedShares,
          totalExpectedRevenue: totalCommittedShares * CAMPAIGN_CONFIG.SHARE_PRICE,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return NextResponse.json({ success: true, snapshot: snapshot[0] });
  } catch (error) {
    await session.abortTransaction();
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}