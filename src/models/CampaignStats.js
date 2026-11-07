import mongoose from "mongoose";
import { CAMPAIGN_CONFIG } from "../lib/constants.js";

const CampaignStatsSchema = new mongoose.Schema({
  _id: { type: String, default: "global" },
  totalPledgedShares: { type: Number, default: 0, min: 0, max: CAMPAIGN_CONFIG.TOTAL_SHARES },
  maxShares: { type: Number, default: CAMPAIGN_CONFIG.TOTAL_SHARES },
  totalRealizedRevenue: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.CampaignStats || mongoose.model("CampaignStats", CampaignStatsSchema);