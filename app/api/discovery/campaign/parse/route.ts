import { NextRequest, NextResponse } from "next/server";
import { parseCampaignBrief } from "@/lib/discovery/campaignProfileAI";
import { DEPTH_SETTINGS, estimateCampaignUnits, type DiscoveryDepth } from "@/lib/discovery/campaignDiscovery";

/**
 * Brief → structured discovery profile. Spends no YouTube quota: the user reviews and edits the
 * profile (and sees the unit cost of each search depth) before anything is searched.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { brief?: unknown };
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (!brief) return NextResponse.json({ error: "Describe the campaign first" }, { status: 400 });
  if (brief.length > 4000) return NextResponse.json({ error: "Keep the brief under 4,000 characters" }, { status: 400 });

  const parsed = await parseCampaignBrief(brief);
  const depths = (Object.keys(DEPTH_SETTINGS) as DiscoveryDepth[]).map((key) => ({
    key,
    ...DEPTH_SETTINGS[key],
    estimatedUnits: estimateCampaignUnits(key),
  }));

  return NextResponse.json({ ...parsed, depths });
}
