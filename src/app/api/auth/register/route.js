import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "../../../../lib/db.js";
import User from "../../../../models/User.js";
import DonorProfile from "../../../../models/DonorProfile.js";
import CampaignStats from "../../../../models/CampaignStats.js";
import { CAMPAIGN_CONFIG, ProfileStatus, UserRole } from "../../../../lib/constants.js";
import { signToken } from "../../../../lib/auth.js";

export async function POST(req) {
  const mongooseInstance = await connectDB();
  const session = await mongooseInstance.startSession();

  try {
    const { name, careOf, phoneNumber, password, shares, commitmentAccepted } = await req.json();

    if (!name || !phoneNumber || !password || !commitmentAccepted) {
      return NextResponse.json({ error: "Missing required fields or commitment agreement" }, { status: 400 });
    }

    const shareCount = Number(shares) || 1;
    if (shareCount <= 0) {
      return NextResponse.json({ error: "Shares must be at least 1" }, { status: 400 });
    }

    session.startTransaction();

    const existingUser = await User.findOne({ phoneNumber }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Phone number already registered" }, { status: 409 });
    }

    let stats = await CampaignStats.findById("global").session(session);
    if (!stats) {
      stats = await CampaignStats.create(
        [{ _id: "global", totalPledgedShares: 0, maxShares: CAMPAIGN_CONFIG.TOTAL_SHARES }],
        { session }
      );
      stats = stats[0];
    }

    if (stats.totalPledgedShares + shareCount > CAMPAIGN_CONFIG.TOTAL_SHARES) {
      await session.abortTransaction();
      return NextResponse.json({ error: "Share limit reached. Requested shares exceed capacity." }, { status: 400 });
    }

    stats.totalPledgedShares += shareCount;
    stats.updatedAt = new Date();
    await stats.save({ session });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const [newUser] = await User.create(
      [
        {
          phoneNumber,
          passwordHash,
          role: UserRole.DONOR,
        },
      ],
      { session }
    );

    const [newProfile] = await DonorProfile.create(
      [
        {
          userId: newUser._id,
          fullName: name,
          careOf: careOf || "",
          shares: shareCount,
          status: ProfileStatus.ACTIVE,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    const token = signToken({
      userId: newUser._id.toString(),
      phoneNumber: newUser.phoneNumber,
      role: newUser.role,
    });

    return NextResponse.json({
      success: true,
      token,
      profile: {
        id: newProfile._id,
        name: newProfile.fullName,
        shares: newProfile.shares,
        monthlyAmount: newProfile.shares * CAMPAIGN_CONFIG.SHARE_PRICE,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    return NextResponse.json({ error: error.message || "Registration failed" }, { status: 500 });
  } finally {
    session.endSession();
  }
}