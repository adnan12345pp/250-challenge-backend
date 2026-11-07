import { NextResponse } from "next/server";
import { connectDB } from "../../../../../lib/db.js";
import User from "../../../../../models/User.js";

export async function POST(req) {
  try {
    await connectDB();
    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const user = await User.findOne({ phoneNumber });
    if (!user) {
      // Return 200 to prevent phone number enumeration attacks
      return NextResponse.json({ message: "If this account exists, an OTP has been sent." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.resetOtp = otp;
    user.resetOtpExpires = expires;
    await user.save();

    // In production, integrate your SMS gateway here (Twilio, Fast2SMS, MSG91)
    console.log(`[SMS Gateway Mock] Reset OTP for ${phoneNumber}: ${otp}`);

    return NextResponse.json({ message: "If this account exists, an OTP has been sent." });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}