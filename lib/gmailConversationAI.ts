import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { looksLikeCreatorPitch } from "@/lib/creatorPitchRule";

const SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["creator", "brand_or_agency", "other"],
      description:
        "creator: Fidem emailed a content creator (or the creator's manager) about doing paid content for a brand. brand_or_agency: Fidem pitched a brand or agency on hiring Fidem to find creators. other: anything else.",
    },
    creatorName: { type: "string", description: "For creator conversations: the channel or creator name as Fidem addressed them (e.g. \"Keo Prints\"). Empty otherwise." },
    channelUrl: { type: "string", description: "A YouTube channel URL for that creator if one appears in the emails, else empty." },
  },
  required: ["kind", "creatorName", "channelUrl"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Fidem Growth is an influencer-marketing agency. It emails two kinds of people:
- Content creators (YouTubers etc.) or their managers, offering a paid brand collaboration and asking their rate.
- Brands or agencies, pitching Fidem's creator-sourcing service or sending them creator shortlists.
You see Fidem's first email in a thread and the other side's latest reply. Say which kind of conversation it is, and for creator conversations, who the creator is.`;

export interface ConversationKind {
  kind: "creator" | "brand_or_agency" | "other";
  creatorName: string;
  channelUrl: string;
}

/**
 * Decides whether a Gmail thread Fidem started is creator outreach — the one thing keywords get
 * wrong, since Fidem's brand pitches talk about creators and subscribers too. Falls back to
 * looksLikeCreatorPitch when no API key is configured.
 */
export async function classifyConversation(params: { subject: string; firstEmail: string; reply: string }): Promise<ConversationKind> {
  const strictKeywords = (): ConversationKind => ({
    kind: looksLikeCreatorPitch(params.subject, params.firstEmail) ? "creator" : "other",
    creatorName: "",
    channelUrl: "",
  });
  if (!process.env.ANTHROPIC_API_KEY) return strictKeywords();

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.beta.messages.parse(
      {
        model: process.env.REPLY_AI_MODEL || "claude-opus-5",
        max_tokens: 2000,
        // A declined request re-runs on a fallback model inside the same call instead of failing.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaJSONSchemaOutputFormat(SCHEMA) },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `<fidem_first_email subject="${params.subject.replace(/"/g, "'")}">\n${params.firstEmail.slice(0, 3000)}\n</fidem_first_email>\n\n<their_latest_reply>\n${params.reply.slice(0, 2000)}\n</their_latest_reply>`,
          },
        ],
      },
      { timeout: 30_000 }
    );
    if (response.stop_reason === "refusal" || !response.parsed_output) return strictKeywords();
    return response.parsed_output as ConversationKind;
  } catch {
    return strictKeywords();
  }
}
