import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../../lib/auth.js";
import DonorProfile from "../../../../../models/DonorProfile.js";
import PaymentClaim from "../../../../../models/PaymentClaim.js";
import { CAMPAIGN_CONFIG, PaymentStatus, ProfileStatus } from "../../../../../lib/constants.js";
import { getCurrentCycle } from "../../../../../lib/date.js";

export async function POST(req) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { donorProfileId, transactionId } = await req.json();
    if (!donorProfileId) {
      return NextResponse.json({ error: "donorProfileId is required" }, { status: 400 });
    }

    await connectDB();

    const profile = await DonorProfile.findOne({ _id: donorProfileId, userId: auth.userId });
    if (!profile) {
      return NextResponse.json({ error: "Donor profile not found" }, { status: 404 });
    }

    if (profile.status === ProfileStatus.DEACTIVATED) {
      return NextResponse.json({ error: "Cannot submit payment claims for a deactivated profile" }, { status: 400 });
    }

    const currentCycle = getCurrentCycle();

    const existingClaim = await PaymentClaim.findOne({
      donorProfileId: profile._id,
      cycle: currentCycle,
      status: { $in: [PaymentStatus.PENDING, PaymentStatus.PAID] },
    });

    if (existingClaim) {
      return NextResponse.json(
        { error: `A claim is already ${existingClaim.status.toLowerCase()} for cycle ${currentCycle}` },
        { status: 409 }
      );
    }

    const expectedAmount = profile.shares * CAMPAIGN_CONFIG.SHARE_PRICE;

    const claim = await PaymentClaim.create({
      donorProfileId: profile._id,
      userId: auth.userId,
      cycle: currentCycle,
      amount: expectedAmount,
      shares: profile.shares,
      status: PaymentStatus.PENDING,
      transactionId: transactionId?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      claim: {
        id: claim._id,
        cycle: claim.cycle,
        status: claim.status,
        amount: claim.amount,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "Duplicate claim or transaction ID already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}