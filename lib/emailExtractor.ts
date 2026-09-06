import Anthropic from "@anthropic-ai/sdk";
import { withHeadroom } from "headroom-ai/anthropic";
import { extractBrandDetailsHeuristic } from "./emailExtractorHeuristic";

export interface ExtractedBrandDetails {
  brandOrAgencyName?: string;
  /** The CLIENT brand/product/campaign name to use inside the email itself — never the agency's own name. */
  campaignOrProductName?: string;
  isAgency?: boolean;
  contactName?: string;
  contactEmail?: string;
  category?: string;
  /** Outreach-friendly phrasing of the category for {Niche_Categories}, e.g. "AR & wearable tech". */
  nicheCategories?: string;
  /** The product's standout features/description for {Key_Product_Features}. */
  keyProductFeatures?: string;
  /** The shopping context the target audience is comparing this against, for {Target_Audience_Or_Angle}. */
  targetAudienceOrAngle?: string;
  budgetRangeText?: string;
  budgetType?: "FLAT_FEE" | "COMMISSION" | "PRODUCT_ONLY" | "HYBRID" | "UNKNOWN";
  influencerRangeMin?: number;
  influencerRangeMax?: number;
  deliverables?: string;
  campaignTimeline?: string;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    const raw = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    client = withHeadroom(raw, { fallback: true, stack: "fidem_email_extractor" });
  }
  return client;
}

const SCHEMA_INSTRUCTIONS = `Extract structured outreach details from this email. The email is either:
- An agency or brand reaching out to a creator/channel about a paid collaboration, or
- Any other email containing a brand/agency name, contact info, budget, or campaign details.

Return ONLY a JSON object (no markdown fences, no other text) with these fields, omitting any field you cannot determine:
{
  "brandOrAgencyName": string,       // the company/agency name sending or referenced in the email — who WE would be emailing
  "campaignOrProductName": string,   // the CLIENT brand/product/campaign name to use inside an email TO this sender.
                                      // If this is an agency and the client brand is never named, DO NOT use the agency's
                                      // own name here — instead use the product itself (e.g. "AR Glasses"), since the
                                      // agency's own name would be nonsensical inside a pitch about their client's product.
  "isAgency": boolean,               // true if this is a marketing/media AGENCY representing a brand, false if it's the brand itself
  "contactName": string,             // sender's first name
  "contactEmail": string,            // sender's email address if visible in the text
  "category": string,                // short product/industry category, e.g. "wearable tech", "AR glasses"
  "nicheCategories": string,         // outreach-friendly niche phrase for creators who'd review this, e.g. "AR & wearable tech"
  "keyProductFeatures": string,      // the product's standout features/description, e.g. "AI tracking and immersive display"
  "targetAudienceOrAngle": string,   // the shopping context/comparison space the audience is in, e.g. "WFH setup",
                                      // "wireless earbuds" — what a viewer would be comparing this product against
  "budgetRangeText": string,         // free text describing pay/budget, e.g. "$500-$1000" or "3% commission, product only"
  "budgetType": "FLAT_FEE" | "COMMISSION" | "PRODUCT_ONLY" | "HYBRID" | "UNKNOWN",
  "influencerRangeMin": number,      // minimum subscriber/follower count mentioned, if any
  "influencerRangeMax": number,      // maximum subscriber/follower count mentioned, if any
  "deliverables": string,            // short summary of deliverables, e.g. "1 YouTube video, 7-day link in bio"
  "campaignTimeline": string         // campaign dates/window mentioned, e.g. "Aug 28 - Sept 4"
}`;

async function extractWithLLM(rawEmailText: string): Promise<ExtractedBrandDetails | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `${SCHEMA_INSTRUCTIONS}\n\nEmail:\n"""${rawEmailText.slice(0, 6000)}"""`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return sanitize(JSON.parse(jsonMatch[0]));
  } catch {
    // LLM extraction is a quality boost, not a requirement — the heuristic result still stands.
    return null;
  }
}

/**
 * Parses a pasted raw email (e.g. an inbound brand/agency pitch) into structured fields to
 * pre-fill the Track/Compose form, so the user doesn't have to retype details that are
 * already sitting in an email. Missing fields are simply omitted — the user fills those in
 * manually, same as today.
 *
 * Works with zero configuration via regex/keyword heuristics (lib/emailExtractorHeuristic.ts).
 * If ANTHROPIC_API_KEY is set, an LLM pass runs on top and fills in anything the heuristics
 * missed or phrased more precisely — but nothing here requires an API key to function.
 */
export async function extractBrandDetailsFromEmail(rawEmailText: string): Promise<ExtractedBrandDetails> {
  if (!rawEmailText.trim()) return {};

  const heuristic = extractBrandDetailsHeuristic(rawEmailText);
  const llm = await extractWithLLM(rawEmailText);
  if (!llm) return heuristic;

  // LLM fields fill gaps and refine over the heuristic result; heuristic still backs up
  // anything the LLM didn't confidently return.
  return { ...heuristic, ...llm };
}

function sanitize(raw: Record<string, unknown>): ExtractedBrandDetails {
  const result: ExtractedBrandDetails = {};
  if (typeof raw.brandOrAgencyName === "string") result.brandOrAgencyName = raw.brandOrAgencyName;
  if (typeof raw.campaignOrProductName === "string") result.campaignOrProductName = raw.campaignOrProductName;
  if (typeof raw.isAgency === "boolean") result.isAgency = raw.isAgency;
  if (typeof raw.contactName === "string") result.contactName = raw.contactName;
  if (typeof raw.contactEmail === "string") result.contactEmail = raw.contactEmail;
  if (typeof raw.category === "string") result.category = raw.category;
  if (typeof raw.nicheCategories === "string") result.nicheCategories = raw.nicheCategories;
  if (typeof raw.keyProductFeatures === "string") result.keyProductFeatures = raw.keyProductFeatures;
  if (typeof raw.targetAudienceOrAngle === "string") result.targetAudienceOrAngle = raw.targetAudienceOrAngle;
  if (typeof raw.budgetRangeText === "string") result.budgetRangeText = raw.budgetRangeText;
  if (
    typeof raw.budgetType === "string" &&
    ["FLAT_FEE", "COMMISSION", "PRODUCT_ONLY", "HYBRID", "UNKNOWN"].includes(raw.budgetType)
  ) {
    result.budgetType = raw.budgetType as ExtractedBrandDetails["budgetType"];
  }
  if (typeof raw.influencerRangeMin === "number") result.influencerRangeMin = raw.influencerRangeMin;
  if (typeof raw.influencerRangeMax === "number") result.influencerRangeMax = raw.influencerRangeMax;
  if (typeof raw.deliverables === "string") result.deliverables = raw.deliverables;
  if (typeof raw.campaignTimeline === "string") result.campaignTimeline = raw.campaignTimeline;
  return result;
}
