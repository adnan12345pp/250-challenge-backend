import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../lib/auth.js";
import DonorProfile from "../../../../models/DonorProfile.js";
import PaymentClaim from "../../../../models/PaymentClaim.js";
import CampaignStats from "../../../../models/CampaignStats.js";
import { CAMPAIGN_CONFIG, PaymentStatus } from "../../../../lib/constants.js";
import { getCurrentCycle } from "../../../../lib/date.js";

export async function GET(req) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const profileId = searchParams.get("profileId");

    // Get selected or first donor profile
    const query = { userId: auth.userId };
    if (profileId) query._id = profileId;

    const profile = await DonorProfile.findOne(query);
    if (!profile) {
      return NextResponse.json({ error: "Donor profile not found" }, { status: 404 });
    }

    const currentCycle = getCurrentCycle();

    // Check payment status strictly for CURRENT month only
    const claim = await PaymentClaim.findOne({
      donorProfileId: profile._id,
      cycle: currentCycle,
    }).sort({ submittedAt: -1 });

    let paymentStatus = PaymentStatus.NOT_PAID;
    if (claim) {
      paymentStatus = claim.status;
    }

    const stats = await CampaignStats.findById("global");

    return NextResponse.json({
      profile: {
        id: profile._id,
        fullName: profile.fullName,
        careOf: profile.careOf,
        shares: profile.shares,
        status: profile.status,
        monthlyCommitment: profile.shares * CAMPAIGN_CONFIG.SHARE_PRICE,
      },
      currentMonth: {
        cycle: currentCycle,
        status: paymentStatus,
        expectedAmount: profile.shares * CAMPAIGN_CONFIG.SHARE_PRICE,
      },
      campaign: {
        pledgedShares: stats ? stats.totalPledgedShares : 0,
        totalShares: CAMPAIGN_CONFIG.TOTAL_SHARES,
        monthlyTarget: CAMPAIGN_CONFIG.MONTHLY_TARGET,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}