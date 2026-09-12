/**
 * The written pitch on a Channel Media Kit — same role aiSummary.ts plays for a single-video
 * Insight OS report, but written to sell a brand on the CHANNEL as a whole rather than judge one
 * upload. Same shape of tradeoff: Anthropic when a key is configured, a deterministic fallback
 * built from the same numbers otherwise, so a missing key degrades the wording, never the report.
 */

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function toArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean).slice(0, 6);
  return fallback;
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export interface ChannelMediaKitContext {
  channelTitle: string;
  niche: string;
  country: string;
  subscriberCount: number;
  averageViews: number;
  engagementRate: number;
  viewToSubscriberRate: number;
  uploadFrequencyLabel: string;
  brandFitScore: number;
  topCategories: string[];
  topVideoTitles: string[];
  sampleComments: string[];
  platforms: string[];
}

export interface ChannelMediaKitNarrative {
  source: "anthropic" | "fallback";
  headline: string;
  pitch: string;
  strengths: string[];
  idealCampaignFit: string;
  audienceInsight: string;
}

function fitLabel(score: number): string {
  if (score >= 80) return "an excellent fit for a paid brand campaign";
  if (score >= 65) return "a strong candidate worth a test campaign";
  if (score >= 45) return "a reasonable option for a smaller, tracked test";
  return "worth a closer look before committing budget";
}

export function fallbackChannelMediaKitNarrative(ctx: ChannelMediaKitContext): ChannelMediaKitNarrative {
  const subs = ctx.subscriberCount.toLocaleString("en-US");
  const category = ctx.topCategories[0] || ctx.niche || "their niche";

  return {
    source: "fallback",
    headline: `${ctx.channelTitle} — a ${subs}-subscriber voice in ${category}`,
    pitch: `${ctx.channelTitle} reaches ${subs} subscribers with an average of ${Math.round(ctx.averageViews).toLocaleString("en-US")} views per upload and a ${ctx.engagementRate.toFixed(1)}% engagement rate — putting ${ctx.viewToSubscriberRate.toFixed(0)}% of their subscriber base in front of every new video. ${ctx.uploadFrequencyLabel}, making this ${fitLabel(ctx.brandFitScore)}.`,
    strengths: [
      `${subs} subscribers in ${category}`,
      `${ctx.engagementRate.toFixed(1)}% average engagement rate`,
      `${ctx.viewToSubscriberRate.toFixed(0)}% of subscribers watch each new upload`,
      ctx.uploadFrequencyLabel,
      ...(ctx.platforms.length > 0 ? [`Also active on ${ctx.platforms.join(", ")}`] : []),
    ].slice(0, 5),
    idealCampaignFit: `Best suited to campaigns in ${category} looking for ${ctx.subscriberCount > 500_000 ? "reach at scale" : "an engaged, closer-knit audience"}.`,
    audienceInsight:
      ctx.sampleComments.length > 0
        ? "Recent comments show an actively engaged audience — review the sample below for tone and sentiment."
        : "Comment volume on recent uploads was too low to draw a reliable audience-sentiment read.",
  };
}

function buildPrompt(ctx: ChannelMediaKitContext): { system: string; user: string } {
  const system = [
    "You are a senior influencer marketing strategist writing a media kit pitch for a brand team deciding whether to run a paid campaign with this YouTube creator.",
    "Use only the data provided. Do not invent private analytics, demographics, or guaranteed results.",
    "Write in a confident, persuasive, professional tone — this document's job is to get a brand excited to work with this creator, while staying honest about the numbers.",
    "Return JSON only. No markdown.",
  ].join(" ");

  const user = [
    "Write the pitch content for a YouTube channel media kit.",
    'Return exactly this JSON shape: {"headline":"","pitch":"","strengths":[],"idealCampaignFit":"","audienceInsight":""}',
    "headline: one punchy sentence, under 15 words, that could be the top of a one-pager.",
    "pitch: 2-3 sentences making the case for this creator, grounded in the real numbers given.",
    "strengths: 3-5 short bullet points, each a standalone selling point.",
    "idealCampaignFit: 1-2 sentences on what kind of brand/campaign this creator suits best.",
    "audienceInsight: 1-2 sentences on what the audience is like, based on the sample comments if given.",
    "Data:",
    JSON.stringify(ctx),
  ].join("\n");

  return { system, user };
}

export async function generateChannelMediaKitNarrative(ctx: ChannelMediaKitContext): Promise<ChannelMediaKitNarrative> {
  const fallback = fallbackChannelMediaKitNarrative(ctx);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const model = process.env.YOUTUBE_INSIGHT_MODEL || "claude-sonnet-5";
  const { system, user } = buildPrompt(ctx);

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model,
      max_tokens: 900,
      temperature: 0.4,
      system,
      // Same assistant-prefill trick aiSummary.ts uses — the reliable way to get JSON-only output
      // with no response_format option and no risk of a preamble breaking the parse.
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: "{" },
      ],
    });

    const block = response.content[0];
    const text = block && block.type === "text" ? block.text : "";
    const parsed = safeJsonParse("{" + text);
    if (!parsed) return fallback;

    return {
      source: "anthropic",
      headline: clean(parsed.headline) || fallback.headline,
      pitch: clean(parsed.pitch) || fallback.pitch,
      strengths: toArray(parsed.strengths, fallback.strengths),
      idealCampaignFit: clean(parsed.idealCampaignFit) || fallback.idealCampaignFit,
      audienceInsight: clean(parsed.audienceInsight) || fallback.audienceInsight,
    };
  } catch (error) {
    // An AI outage must never fail the report — the deterministic fallback already covers the
    // same ground, just without the written pitch.
    console.error("[Channel Media Kit] AI narrative generation failed:", error instanceof Error ? error.message : error);
    return fallback;
  }
}
