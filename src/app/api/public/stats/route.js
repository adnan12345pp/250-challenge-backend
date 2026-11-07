import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db.js";
import CampaignStats from "../../../../models/CampaignStats.js";
import DonorProfile from "../../../../models/DonorProfile.js";
import { CAMPAIGN_CONFIG, ProfileStatus } from "../../../../lib/constants.js";

export async function GET() {
  try {
    await connectDB();

    const stats = await CampaignStats.findById("global");
    const pledgedShares = stats ? stats.totalPledgedShares : 0;
    const remainingShares = Math.max(0, CAMPAIGN_CONFIG.TOTAL_SHARES - pledgedShares);

    const totalParticipants = await DonorProfile.countDocuments({ status: ProfileStatus.ACTIVE });

    return NextResponse.json({
      totalShares: CAMPAIGN_CONFIG.TOTAL_SHARES,
      pledgedShares,
      remainingShares,
      totalParticipants,
      monthlyTarget: CAMPAIGN_CONFIG.MONTHLY_TARGET,
      sharePrice: CAMPAIGN_CONFIG.SHARE_PRICE,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}