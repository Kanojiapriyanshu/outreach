/**
 * Shared definitions for the Brand Outreach view and its CSV export — which slice of brand
 * sequences each filter means, and plain-language labels for what a brand replied. The brand-side
 * twin of lib/influencerOutreach.ts: brands are read in terms of the creator list (do they want one,
 * did they pick someone), not a rate.
 */
import type { Prisma } from "@/app/generated/prisma/client";
import { FOLLOWING_UP_STATUSES } from "@/lib/influencerOutreach";

export const BRAND_VIEWS = [
  { key: "all", label: "All" },
  { key: "needs-response", label: "Needs your reply" },
  { key: "wants-list", label: "Wants creators" },
  { key: "list-sent", label: "Creators sent" },
  { key: "roster-sent", label: "Roster link sent" },
  { key: "in-talks", label: "In talks" },
  { key: "deals", label: "Deals" },
  { key: "following-up", label: "Following up" },
  { key: "no-reply", label: "No reply" },
  { key: "declined", label: "Declined" },
  { key: "bounced", label: "Bounced" },
  { key: "starred", label: "Starred" },
] as const;

export type BrandView = (typeof BRAND_VIEWS)[number]["key"];

export function parseBrandView(raw: string | undefined | null): BrandView {
  return BRAND_VIEWS.some((v) => v.key === raw) ? (raw as BrandView) : "all";
}

export const BRAND_BASE: Prisma.OutreachSequenceWhereInput = { outreachType: "BRAND", deletedAt: null };

/** A brand counts as having replied once any answer came in — including replies recorded before
 * the reply text itself was being stored (status alone tells us those). */
export const BRAND_REPLIED_WHERE: Prisma.OutreachSequenceWhereInput = {
  OR: [
    { lastReplyAt: { not: null } },
    { status: { in: ["REPLIED", "UNSUBSCRIBED"] } },
    { stage: { in: ["CREATOR_LIST_REQUESTED", "NEGOTIATION", "CREATOR_SELECTED", "DEAL"] } },
  ],
};

export function brandViewWhere(view: BrandView): Prisma.OutreachSequenceWhereInput {
  switch (view) {
    case "needs-response":
      return { awaitingResponseSince: { not: null } };
    case "wants-list":
      return { stage: "CREATOR_LIST_REQUESTED" };
    case "roster-sent":
      return { rosterSentAt: { not: null } };
    case "list-sent":
      return { stage: "CREATOR_LIST_SENT" };
    case "in-talks":
      return { stage: { in: ["NEGOTIATION", "CREATOR_SELECTED"] } };
    case "deals":
      return { stage: "DEAL" };
    case "following-up":
      return { status: { in: [...FOLLOWING_UP_STATUSES] }, awaitingResponseSince: null };
    case "no-reply":
      return { status: "COMPLETED" };
    case "declined":
      return { OR: [{ status: "UNSUBSCRIBED" }, { stage: "NOT_INTERESTED", status: "REPLIED" }] };
    case "bounced":
      return { status: "BOUNCED" };
    case "starred":
      return { isImportant: true };
    default:
      return {};
  }
}

export function brandSearchWhere(q: string | undefined | null): Prisma.OutreachSequenceWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const has = { contains: term, mode: "insensitive" as const };
  return {
    OR: [
      { contact: { name: has } },
      { contact: { email: has } },
      { contact: { brand: { name: has } } },
      { contact: { brand: { category: has } } },
      { lastReplyText: has },
    ],
  };
}

export const BRAND_REPLY_LABEL: Record<string, string> = {
  WANTS_CREATOR_LIST: "Wants the creator list",
  CREATOR_CHOSEN: "Picked a creator",
  NON_COMMITTAL: "Will get back to you",
  UNINTERESTED: "Passed",
  OPT_OUT: "Asked not to be contacted",
  HUMAN_REPLY: "Replied",
};

export function brandReplyLabel(intent: string | null | undefined): string {
  return (intent && BRAND_REPLY_LABEL[intent]) || "Replied";
}
