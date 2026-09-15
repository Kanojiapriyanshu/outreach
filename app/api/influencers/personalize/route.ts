import { NextRequest, NextResponse } from "next/server";
import { activeCreatorEmailTemplate, personalizeCreator, type PersonalizedDraft } from "@/lib/creatorEnrichment";

export const maxDuration = 60;

const MAX_PER_REQUEST = 20;
const CONCURRENCY = 4;

interface PersonalizeBody {
  creatorIds?: string[];
  channelUrl?: string;
  channelId?: string;
  campaign?: { brandCategory?: string; deliverable?: string };
  refresh?: boolean;
}

function cleanCampaign(campaign: PersonalizeBody["campaign"]) {
  return {
    brandCategory: typeof campaign?.brandCategory === "string" ? campaign.brandCategory.trim().slice(0, 120) : undefined,
    deliverable: typeof campaign?.deliverable === "string" ? campaign.deliverable.trim().slice(0, 120) : undefined,
  };
}

/**
 * Influencer Email 1, filled in from each creator's channel: a list of saved creators (bulk pitch),
 * or a single channel link / id (compose). Everything returned is a draft — the page lets the team
 * edit it before anything is sent.
 */
export async function POST(req: NextRequest) {
  let body: PersonalizeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const campaign = cleanCampaign(body.campaign);
  const template = await activeCreatorEmailTemplate();
  if (!template) return NextResponse.json({ error: "No active creator Email 1 template — set one up on the Templates page." }, { status: 400 });

  if (Array.isArray(body.creatorIds) && body.creatorIds.length > 0) {
    const ids = [...new Set(body.creatorIds.filter((id) => typeof id === "string"))];
    if (ids.length > MAX_PER_REQUEST) return NextResponse.json({ error: `At most ${MAX_PER_REQUEST} creators per request` }, { status: 400 });
    const drafts: PersonalizedDraft[] = [];
    const errors: { creatorId: string; error: string }[] = [];
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const settled = await Promise.allSettled(
        ids.slice(i, i + CONCURRENCY).map((creatorId) => personalizeCreator({ creatorId }, campaign, { refresh: !!body.refresh, template }))
      );
      settled.forEach((outcome, j) => {
        const creatorId = ids[i + j];
        if (outcome.status === "fulfilled") drafts.push(outcome.value);
        else errors.push({ creatorId, error: outcome.reason instanceof Error ? outcome.reason.message : "Couldn't read this channel" });
      });
    }
    return NextResponse.json({ drafts, errors });
  }

  if (!body.channelUrl && !body.channelId) return NextResponse.json({ error: "Pass creatorIds, channelUrl or channelId" }, { status: 400 });
  try {
    const draft = await personalizeCreator({ channelUrl: body.channelUrl, channelId: body.channelId }, campaign, { refresh: !!body.refresh, template });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't read this channel" }, { status: 400 });
  }
}
