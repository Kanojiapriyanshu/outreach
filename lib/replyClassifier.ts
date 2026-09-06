import Anthropic from "@anthropic-ai/sdk";
import { withHeadroom } from "headroom-ai/anthropic";
import { classifyReplyHeuristic } from "./replyClassifierHeuristic";

export type ReplyClassification =
  | "HUMAN_REPLY"
  | "NON_COMMITTAL"
  | "WANTS_CREATOR_LIST"
  | "CREATOR_CHOSEN"
  | "AUTO_REPLY"
  | "UNINTERESTED"
  | "OPT_OUT";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    const raw = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Compresses the request before it reaches Anthropic to cut token usage. Requires a local
    // `headroom proxy` running (see README); `fallback: true` means if that proxy isn't up,
    // this just behaves like a plain Anthropic client instead of failing the classification.
    client = withHeadroom(raw, { fallback: true, stack: "fidem_reply_classifier" });
  }
  return client;
}

/**
 * Classifies an inbound reply beyond the header-based auto-reply heuristic in lib/gmail.ts:
 * - NON_COMMITTAL: acknowledges but doesn't engage with specifics ("thanks, will review and
 *   get back to you") — the automatic follow-up cadence keeps going, exactly as if no reply had
 *   come in, just redirected to ask whether they've checked internally.
 * - WANTS_CREATOR_LIST: only offered before the list has been sent — the brand shows interest
 *   and is asking to see creators/profiles/media kit.
 * - CREATOR_CHOSEN: only offered after the list has been sent — the brand names or clearly
 *   commits to a specific creator or creators.
 * - UNINTERESTED vs OPT_OUT: "not a fit for this campaign" (stop follow-ups on this sequence
 *   only) vs. "stop emailing me entirely" (also suppress the contact everywhere).
 *
 * Zero-API-key by default: runs the regex/keyword heuristic in replyClassifierHeuristic.ts.
 * Only reaches for the paid LLM when ANTHROPIC_API_KEY is actually configured (for cases the
 * heuristic can't reliably catch — nuanced phrasing, sarcasm, etc.), and falls straight back to
 * the heuristic's result on any API error, so a billing/network hiccup never blocks a decision.
 */
export async function classifyReply(
  snippet: string,
  context: { creatorListAlreadySent: boolean }
): Promise<ReplyClassification> {
  if (!snippet.trim()) return "HUMAN_REPLY";
  const heuristicResult = classifyReplyHeuristic(snippet, context);

  const anthropic = getClient();
  if (!anthropic) return heuristicResult;

  const situational = context.creatorListAlreadySent
    ? `- CREATOR_CHOSEN: the team already sent this brand a shortlist of creators to choose from. This reply clearly commits to one or more of them — names a creator, says "let's go with [name]", "we want this one", "yes to this creator", or similarly decisive language about which creator(s) they want.`
    : `- WANTS_CREATOR_LIST: the brand is interested and is asking to see creators, profiles, a media kit, or similar — a request to be sent the shortlist.`;

  const label = context.creatorListAlreadySent ? "CREATOR_CHOSEN" : "WANTS_CREATOR_LIST";

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: `Classify this email reply snippet into exactly one label: HUMAN_REPLY, NON_COMMITTAL, ${label}, AUTO_REPLY, UNINTERESTED, or OPT_OUT.
- AUTO_REPLY: out-of-office / vacation responder / automated acknowledgment, not a real answer.
- OPT_OUT: explicitly asks to stop being contacted / emailed / to be removed from the list, entirely.
- UNINTERESTED: declines or passes on THIS specific opportunity/campaign, without asking to stop being contacted generally (e.g. "not a fit right now", "we'll pass on this one").
- NON_COMMITTAL: acknowledges the email but doesn't actually engage with specifics — no real answer either way (e.g. "thanks, will take a look and get back to you", "got it, received", "noted", "we'll check with the team").
${situational}
- HUMAN_REPLY: any other genuine, substantive response that doesn't fit the above (asking unrelated questions, negotiating terms, etc).

Reply the label only, no other text.

Snippet:
"""${snippet.slice(0, 1000)}"""`,
        },
      ],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .toUpperCase();

    if (text.includes("OPT_OUT")) return "OPT_OUT";
    if (text.includes("AUTO_REPLY")) return "AUTO_REPLY";
    if (text.includes("UNINTERESTED")) return "UNINTERESTED";
    if (text.includes("CREATOR_CHOSEN")) return "CREATOR_CHOSEN";
    if (text.includes("WANTS_CREATOR_LIST")) return "WANTS_CREATOR_LIST";
    if (text.includes("NON_COMMITTAL")) return "NON_COMMITTAL";
    return "HUMAN_REPLY";
  } catch {
    // The LLM call is an enhancement, not a requirement — fall back to the heuristic's read
    // rather than defaulting blind to HUMAN_REPLY on a transient API error.
    return heuristicResult;
  }
}

export function isClassifierConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
