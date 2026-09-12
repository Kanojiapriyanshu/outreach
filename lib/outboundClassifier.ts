import { prisma } from "@/lib/prisma";

/**
 * Guesses which automated track a brand-new outbound email belongs to — the same BRAND/CREATOR
 * split that Templates and the follow-up cadence are already keyed on (see lib/scheduler.ts's
 * computeNextScheduledAt). This exists so composing directly from the inbox can plug into that
 * same machinery instead of only the guided New Outreach form: whoever wrote the email already
 * knows who they're emailing, so the CRM should be able to tell too, rather than making them
 * re-declare it in a separate flow.
 *
 * Two signals, tried in order:
 *  1. An existing Contact with this email address — if the team has already emailed this person
 *     before, whatever type that was is definitive. No guessing needed, and definitely no risk of
 *     a second guess disagreeing with the first and confusing the pipeline.
 *  2. Keyword scoring on the subject + body — cheap, synchronous, no API key required, in the
 *     same spirit as lib/emailExtractorHeuristic.ts's zero-config fallback. A brand-new email
 *     about "your channel" and "subscribers" reads as creator outreach; one about "your brand"
 *     and "influencer marketing" reads as brand/agency outreach.
 *
 * When neither signal is strong enough to be worth acting on automatically, the result says so
 * (outreachType: null) rather than guessing — a wrong automatic classification means the wrong
 * template cadence and wrong follow-ups going out on their own, which is worse than just asking
 * the person composing the email to confirm. The caller always shows this as an editable
 * suggestion, never a silent decision.
 */
export type OutboundGuess =
  | { outreachType: "BRAND"; recipientType: "DIRECT" | "AGENCY"; source: "existing-contact" | "keywords"; reason: string }
  | { outreachType: "CREATOR"; source: "existing-contact" | "keywords"; reason: string }
  | { outreachType: null; source: "no-signal"; reason: string };

const CREATOR_SIGNALS = [
  "your channel",
  "your videos",
  "your content",
  "your audience",
  "your subscribers",
  "subscribers",
  "your youtube",
  "dedicated video",
  "sponsored video",
  "content creator",
  "influencer like you",
  "your following",
  "your viewers",
];

const BRAND_SIGNALS = [
  "your brand",
  "your product",
  "your campaign",
  "influencer marketing",
  "creator marketing",
  "our creators",
  "our roster",
  "our network of creators",
  "collaborate with creators",
  "influencer campaign",
  "partner with creators",
  "our talent",
];

const AGENCY_SIGNALS = ["agency", "media group", "marketing group", "pr firm", "talent partnerships"];

function countMatches(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

/** Exported separately so the keyword scoring can be unit-tested without a database. */
export function classifyByKeywords(subject: string, bodyText: string): OutboundGuess {
  const text = `${subject}\n${bodyText}`;
  const creatorHits = countMatches(text, CREATOR_SIGNALS);
  const brandHits = countMatches(text, BRAND_SIGNALS);

  if (creatorHits.length === 0 && brandHits.length === 0) {
    return { outreachType: null, source: "no-signal", reason: "Nothing in the subject or body suggests brand or creator outreach." };
  }

  if (creatorHits.length > brandHits.length) {
    return { outreachType: "CREATOR", source: "keywords", reason: `Matched: ${creatorHits.map((h) => `"${h}"`).join(", ")}` };
  }

  const agencyHits = countMatches(text, AGENCY_SIGNALS);
  return {
    outreachType: "BRAND",
    recipientType: agencyHits.length > 0 ? "AGENCY" : "DIRECT",
    source: "keywords",
    reason: `Matched: ${brandHits.map((h) => `"${h}"`).join(", ")}`,
  };
}

export async function guessOutboundType(params: { toEmail: string; subject: string; bodyText: string }): Promise<OutboundGuess> {
  const email = params.toEmail.trim().toLowerCase();

  if (email) {
    const contact = await prisma.contact.findFirst({
      where: { email },
      include: { brand: true, creator: true },
      orderBy: { createdAt: "desc" },
    });
    if (contact?.brand) {
      return {
        outreachType: "BRAND",
        recipientType: contact.brand.isAgency ? "AGENCY" : "DIRECT",
        source: "existing-contact",
        reason: `You've already tracked ${contact.brand.name} as a ${contact.brand.isAgency ? "agency" : "brand"} contact.`,
      };
    }
    if (contact?.creator) {
      return { outreachType: "CREATOR", source: "existing-contact", reason: `You've already tracked ${contact.creator.name} as a creator contact.` };
    }
  }

  return classifyByKeywords(params.subject, params.bodyText);
}
