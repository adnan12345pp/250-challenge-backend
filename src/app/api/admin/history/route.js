import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db.js";
import { getAuthenticatedUser } from "../../../../lib/auth.js";
import PaymentClaim from "../../../../models/PaymentClaim.js";
import DonorProfile from "../../../../models/DonorProfile.js";
import "../../../../models/User.js";
import { UserRole } from "../../../../lib/constants.js";

export async function GET(req) {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth || auth.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    await connectDB();
    const { searchParams } = new URL(req.url);
    const cycle = searchParams.get("cycle");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const query = {};
    if (cycle) query.cycle = cycle;
    if (status) query.status = status;

    const [claims, total, profiles] = await Promise.all([
      PaymentClaim.find(query)
        .populate("donorProfileId", "fullName careOf shares")
        .populate("userId", "phoneNumber")
        .sort({ submittedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PaymentClaim.countDocuments(query),
      DonorProfile.find({})
        .populate("userId", "phoneNumber")
        .sort({ createdAt: -1 }),
    ]);

    return NextResponse.json({
      claims,
      profiles,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}