/**
 * AI-assisted brief parsing: the same CampaignProfile heuristicParseBrief() produces, but able to
 * read a brief phrased any way and to propose related products (semantic expansion) a rule-based
 * parser can't invent.
 *
 * The rules always run first and are the fallback for every failure mode — no key configured, an
 * API error, a refusal, an unparseable response — so brief parsing never blocks discovery. And the
 * model is only trusted for what it can read from the brief: brands must appear in the brief text,
 * and numbers are dropped when the brief contains none.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { CONTENT_FORMATS, heuristicParseBrief, normalizeProfile, type CampaignProfile, type ParsedBrief } from "./campaignProfile";

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    market: { type: "string", description: "ISO 3166-1 alpha-2 code of the target market, or an empty string if none is stated." },
    minSubscribers: { type: "integer", description: "Minimum subscriber count, or 0 if not stated." },
    maxSubscribers: { type: "integer", description: "Maximum subscriber count, or 0 if not stated." },
    category: { type: "string", description: "The niche in one or two lowercase words, e.g. fitness." },
    targetProducts: { type: "array", items: { type: "string" }, description: "Products or product categories the brief is about, lowercase." },
    relatedTerms: { type: "array", items: { type: "string" }, description: "8-12 adjacent products or sub-categories, lowercase." },
    desiredContent: { type: "array", items: { type: "string", enum: CONTENT_FORMATS }, description: "Content formats the brief asks for." },
    brands: { type: "array", items: { type: "string" }, description: "Brand names written in the brief. Empty if none." },
    minEngagementRate: { type: "number", description: "Minimum engagement rate in percent, or 0 if not stated." },
    creatorCount: { type: "integer", description: "How many creators the brief asks for, or 0 if not stated." },
    requireProductReviewers: { type: "boolean", description: "Whether the campaign needs creators who review, unbox or test physical products." },
  },
  required: [
    "market",
    "minSubscribers",
    "maxSubscribers",
    "category",
    "targetProducts",
    "relatedTerms",
    "desiredContent",
    "brands",
    "minEngagementRate",
    "creatorCount",
    "requireProductReviewers",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You turn influencer-marketing briefs into a structured profile for a YouTube creator discovery system. The profile drives keyword searches and relevance scoring.

- targetProducts: the specific products or product categories the brief is about.
- relatedTerms: 8-12 adjacent products or sub-categories that a genuinely relevant creator would also make videos about. For a treadmill brief that means things like walking pad, under desk treadmill, home gym equipment, exercise bike. Keep these as product or category nouns — format words like "review" belong in desiredContent, and brand names don't belong in relatedTerms.
- desiredContent: the content formats the brief asks for.
- requireProductReviewers: true when the campaign needs creators who review, unbox or test physical products.
- Only report a market, numbers, or brands the brief actually states. Use 0 or an empty value for anything it doesn't.`;

function withNote(rules: ParsedBrief, note: string): ParsedBrief {
  return { ...rules, notes: [note, ...rules.notes] };
}

export async function parseCampaignBrief(brief: string): Promise<ParsedBrief> {
  const rules = heuristicParseBrief(brief);
  if (!process.env.ANTHROPIC_API_KEY) {
    return withNote(rules, "AI brief parsing isn't configured (no ANTHROPIC_API_KEY), so the brief was read with rules — check the fields below.");
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.beta.messages.parse(
      {
        model: process.env.DISCOVERY_AI_MODEL || "claude-opus-5",
        max_tokens: 4000,
        // A declined request re-runs on a fallback model inside the same call instead of failing.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaJSONSchemaOutputFormat(PROFILE_SCHEMA) },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `<brief>\n${brief}\n</brief>` }],
      },
      { timeout: 45_000 }
    );

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return withNote(rules, "AI couldn't structure this brief, so it was read with rules — check the fields below.");
    }

    const ai = normalizeProfile(response.parsed_output);
    const briefLower = brief.toLowerCase();
    const briefHasNumbers = /\d/.test(brief);

    const merged: CampaignProfile = {
      ...ai,
      market: ai.market || rules.profile.market,
      category: ai.category || rules.profile.category,
      targetProducts: ai.targetProducts.length > 0 ? ai.targetProducts : rules.profile.targetProducts,
      desiredContent: ai.desiredContent.length > 0 ? ai.desiredContent : rules.profile.desiredContent,
      brands: ai.brands.filter((b) => briefLower.includes(b.toLowerCase())),
      minSubscribers: briefHasNumbers ? (ai.minSubscribers ?? rules.profile.minSubscribers) : null,
      maxSubscribers: briefHasNumbers ? (ai.maxSubscribers ?? rules.profile.maxSubscribers) : null,
      minEngagementRate: briefHasNumbers ? (ai.minEngagementRate ?? rules.profile.minEngagementRate) : null,
      creatorCount: briefHasNumbers ? ai.creatorCount : rules.profile.creatorCount,
    };
    const profile = normalizeProfile(merged);

    const notes = ["Related products are AI suggestions for widening the search — remove any that don't fit."];
    if (!profile.market) notes.push("No market named — creators from any country will be considered.");
    if (profile.minSubscribers === null && profile.maxSubscribers === null) notes.push("No subscriber range named — any channel size will be considered.");
    return { profile, source: "ai", notes };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error("[Campaign discovery] Brief parsing rate-limited:", error.message);
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[Campaign discovery] Brief parsing failed (${error.status}):`, error.message);
    } else {
      console.error("[Campaign discovery] Brief parsing failed:", error);
    }
    return withNote(rules, "AI brief parsing failed, so the brief was read with rules — check the fields below.");
  }
}
