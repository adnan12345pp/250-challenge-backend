import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "../../../../../lib/db.js";
import User from "../../../../../models/User.js";

export async function POST(req) {
  try {
    await connectDB();
    const { phoneNumber, otp, newPassword } = await req.json();

    if (!phoneNumber || !otp || !newPassword) {
      return NextResponse.json({ error: "Phone number, OTP, and new password are required" }, { status: 400 });
    }

    const user = await User.findOne({
      phoneNumber,
      resetOtp: otp,
      resetOtpExpires: { $gt: new Date() },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    await user.save();

    return NextResponse.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}