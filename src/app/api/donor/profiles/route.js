import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../lib/auth.js";
import DonorProfile from "../../../../models/DonorProfile.js";
import CampaignStats from "../../../../models/CampaignStats.js";
import { CAMPAIGN_CONFIG, ProfileStatus } from "../../../../lib/constants.js";

// List all profiles belonging to the authenticated account
export async function GET() {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const profiles = await DonorProfile.find({ userId: auth.userId });

    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Add a new profile under the same account
export async function POST(req) {
  const mongooseInstance = await connectDB();
  const session = await mongooseInstance.startSession();

  try {
    const auth = await getAuthenticatedUser();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fullName, careOf, shares } = await req.json();
    const shareCount = Number(shares) || 1;

    if (!fullName || shareCount <= 0) {
      return NextResponse.json({ error: "Valid name and share count required" }, { status: 400 });
    }

    session.startTransaction();

    let stats = await CampaignStats.findById("global").session(session);
    if (stats.totalPledgedShares + shareCount > CAMPAIGN_CONFIG.TOTAL_SHARES) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Share limit reached" }, { status: 400 });
    }

    stats.totalPledgedShares += shareCount;
    stats.updatedAt = new Date();
    await stats.save({ session });

    const [newProfile] = await DonorProfile.create(
      [
        {
          userId: auth.userId,
          fullName,
          careOf: careOf || "",
          shares: shareCount,
          status: ProfileStatus.ACTIVE,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return NextResponse.json({ success: true, profile: newProfile });
  } catch (error) {
    await session.abortTransaction();
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    session.endSession();
  }
}