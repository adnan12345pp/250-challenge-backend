import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../lib/auth.js";
import CampaignStats from "../../../../models/CampaignStats.js";
import PaymentClaim from "../../../../models/PaymentClaim.js";
import { CAMPAIGN_CONFIG, PaymentStatus, UserRole } from "../../../../lib/constants.js";
import { getCurrentCycle } from "../../../../lib/date.js";

export async function GET() {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth || auth.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    await connectDB();
    const currentCycle = getCurrentCycle();

    const stats = await CampaignStats.findById("global");

    // Realized income strictly for current cycle
    const cyclePaidClaims = await PaymentClaim.aggregate([
      { $match: { cycle: currentCycle, status: PaymentStatus.PAID } },
      { $group: { _id: null, totalIncome: { $sum: "$amount" }, paidShares: { $sum: "$shares" } } },
    ]);

    const currentCycleIncome = cyclePaidClaims[0]?.totalIncome || 0;
    const sharesPaidThisCycle = cyclePaidClaims[0]?.paidShares || 0;

    return NextResponse.json({
      cycle: currentCycle,
      pledgedShares: stats ? stats.totalPledgedShares : 0,
      totalShares: CAMPAIGN_CONFIG.TOTAL_SHARES,
      realizedIncomeThisCycle: currentCycleIncome,
      lifetimeRealizedIncome: stats ? stats.totalRealizedRevenue : 0,
      sharesPaidThisCycle,
      monthlyTarget: CAMPAIGN_CONFIG.MONTHLY_TARGET,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}