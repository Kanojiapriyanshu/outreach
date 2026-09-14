/**
 * Shared definitions for the Influencer Outreach view and its CSV export — which slice of creator
 * sequences each filter means, and the plain-language labels for what a creator replied. Kept in one
 * place so the page and the export can never disagree about who counts as "no reply".
 */
import type { Prisma } from "@/app/generated/prisma/client";

export const INFLUENCER_VIEWS = [
  { key: "all", label: "All" },
  { key: "needs-response", label: "Needs your reply" },
  { key: "rates", label: "Rate received" },
  { key: "interested", label: "Interested" },
  { key: "following-up", label: "Following up" },
  { key: "no-reply", label: "No reply" },
  { key: "declined", label: "Declined" },
  { key: "bounced", label: "Bounced" },
] as const;

export type InfluencerView = (typeof INFLUENCER_VIEWS)[number]["key"];

export function parseInfluencerView(raw: string | undefined | null): InfluencerView {
  return INFLUENCER_VIEWS.some((v) => v.key === raw) ? (raw as InfluencerView) : "all";
}

/** Still inside an automatic cadence, waiting on the creator. */
export const FOLLOWING_UP_STATUSES = [
  "WAITING_FOR_REPLY",
  "FOLLOW_UP_1_SENT",
  "FOLLOW_UP_2_SENT",
  "FOLLOW_UP_3_SENT",
  "FOLLOW_UP_4_SENT",
] as const;

export const REPLIED_WHERE: Prisma.OutreachSequenceWhereInput = {
  OR: [{ lastReplyAt: { not: null } }, { status: { in: ["REPLIED", "UNSUBSCRIBED"] } }],
};

export function influencerViewWhere(view: InfluencerView): Prisma.OutreachSequenceWhereInput {
  switch (view) {
    case "needs-response":
      return { awaitingResponseSince: { not: null } };
    case "rates":
      return { quotedRateAt: { not: null } };
    case "interested":
      return { stage: "INTERESTED" };
    case "following-up":
      return { status: { in: [...FOLLOWING_UP_STATUSES] }, awaitingResponseSince: null };
    case "no-reply":
      return { status: "COMPLETED", lastReplyAt: null };
    case "declined":
      return { OR: [{ status: "UNSUBSCRIBED" }, { stage: "NOT_INTERESTED", lastReplyAt: { not: null } }] };
    case "bounced":
      return { status: "BOUNCED" };
    default:
      return {};
  }
}

export function influencerSearchWhere(q: string | undefined | null): Prisma.OutreachSequenceWhereInput {
  const term = q?.trim();
  if (!term) return {};
  return {
    OR: [
      { contact: { name: { contains: term, mode: "insensitive" } } },
      { contact: { email: { contains: term, mode: "insensitive" } } },
      { contact: { creator: { name: { contains: term, mode: "insensitive" } } } },
      { contact: { creator: { channelName: { contains: term, mode: "insensitive" } } } },
    ],
  };
}

export const REPLY_INTENT_LABEL: Record<string, string> = {
  RATE_SHARED: "Shared their rate",
  INTERESTED: "Interested",
  NON_COMMITTAL: "Will get back to you",
  UNINTERESTED: "Declined",
  OPT_OUT: "Asked not to be contacted",
  HUMAN_REPLY: "Replied",
};

export function replyIntentLabel(intent: string | null | undefined): string {
  return (intent && REPLY_INTENT_LABEL[intent]) || "Replied";
}

/**
 * One CSV cell. Reply text is written by people outside the team, so a cell starting with a
 * formula character is prefixed — otherwise opening the export in Excel or Sheets would run it.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
