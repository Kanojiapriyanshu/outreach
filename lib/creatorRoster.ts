/**
 * The Creators roster's filters — which creators each filter means — shared by the page and its CSV
 * export so the two can never disagree. Pure: only Prisma *types* are imported.
 */
import type { Prisma } from "@/app/generated/prisma/client";

export const ROSTER_PLATFORMS = [
  { key: "instagram", label: "Instagram", short: "IG" },
  { key: "tiktok", label: "TikTok", short: "TT" },
  { key: "pinterest", label: "Pinterest", short: "Pin" },
  { key: "amazonStorefront", label: "Amazon", short: "Amz" },
  { key: "facebook", label: "Facebook", short: "FB" },
  { key: "twitter", label: "X / Twitter", short: "X" },
] as const;

export const ROSTER_STATUSES = [
  { key: "", label: "Everyone" },
  { key: "not-contacted", label: "Not contacted" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "rate", label: "Has a rate" },
  { key: "ready", label: "Ready to pitch (replied or has a rate)" },
] as const;

export const ROSTER_SORTS = [
  { key: "recent", label: "Recently added" },
  { key: "subscribers", label: "Most subscribers" },
  { key: "engagement", label: "Highest engagement" },
  { key: "rate", label: "Lowest rate" },
] as const;

export interface RosterFilters {
  q: string;
  email: "" | "has" | "missing";
  platform: string;
  status: string;
  sort: string;
}

export function parseRosterFilters(params: Record<string, string | undefined | null>): RosterFilters {
  const email = params.email === "has" || params.email === "missing" ? params.email : "";
  const platform = ROSTER_PLATFORMS.some((p) => p.key === params.platform) ? params.platform! : "";
  const status = ROSTER_STATUSES.some((s) => s.key === params.status) ? params.status! : "";
  const sort = ROSTER_SORTS.some((s) => s.key === params.sort) ? params.sort! : "recent";
  return { q: (params.q ?? "").trim().slice(0, 100), email, platform, status, sort };
}

const LIVE_SEQUENCE: Prisma.OutreachSequenceWhereInput = { deletedAt: null };

const REPLIED_SEQUENCE: Prisma.OutreachSequenceWhereInput = {
  ...LIVE_SEQUENCE,
  OR: [{ lastReplyAt: { not: null } }, { status: { in: ["REPLIED", "UNSUBSCRIBED"] } }],
};

// Words that describe the search rather than the creator ("creators who did smart home before").
const STOP_WORDS = new Set([
  "a", "an", "and", "the", "or", "of", "for", "to", "in", "on", "with", "who", "that", "has", "have", "had", "did",
  "done", "do", "does", "before", "ever", "any", "creator", "creators", "someone", "people", "video", "videos",
  "replied", "reply", "project", "campaign", "brand", "brands", "collab", "collaboration",
]);
const MAX_TERMS = 6;

/**
 * The search box split into the words that matter. Every word has to match somewhere on the
 * creator (in any field), so "smart lock review" finds a creator whose reply mentions a smart lock
 * and whose videos are reviews — the whole phrase never has to appear in one place.
 */
export function searchTerms(q: string): string[] {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}&'+.-]+/u)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((w) => w.length >= 2);
  const meaningful = [...new Set(words.filter((w) => !STOP_WORDS.has(w)))];
  if (meaningful.length > 0) return meaningful.slice(0, MAX_TERMS);
  const whole = q.trim().toLowerCase();
  return whole ? [whole] : [];
}

/** Creator ids whose media-kit video titles contain each term — looked up separately (a JSON
 * query), then folded into the same per-term OR as every other field. */
export type KitTitleMatches = Record<string, string[]>;

function termWhere(term: string, kitMatches: KitTitleMatches): Prisma.CreatorWhereInput {
  const has = { contains: term, mode: "insensitive" as const };
  const or: Prisma.CreatorWhereInput[] = [
    { name: has },
    { channelName: has },
    { email: has },
    { niche: has },
    { contentHighlights: has },
    { description: has },
    { notes: has },
    { quotedRateDeliverable: has },
    {
      contacts: {
        some: {
          sequences: {
            some: { ...LIVE_SEQUENCE, OR: [{ lastReplyText: has }, { replySummary: has }, { rateNote: has }] },
          },
        },
      },
    },
  ];
  const kitIds = kitMatches[term];
  if (kitIds && kitIds.length > 0) or.push({ id: { in: kitIds } });
  return { OR: or };
}

export function rosterWhere(f: RosterFilters, kitMatches: KitTitleMatches = {}): Prisma.CreatorWhereInput {
  const and: Prisma.CreatorWhereInput[] = [];
  for (const term of searchTerms(f.q)) and.push(termWhere(term, kitMatches));
  if (f.email === "has") and.push({ email: { not: null } });
  if (f.email === "missing") and.push({ email: null });
  if (f.platform) and.push({ platformTags: { has: f.platform } });
  if (f.status === "not-contacted") and.push({ contacts: { none: { sequences: { some: LIVE_SEQUENCE } } } });
  if (f.status === "contacted") and.push({ contacts: { some: { sequences: { some: LIVE_SEQUENCE } } } });
  if (f.status === "replied") and.push({ contacts: { some: { sequences: { some: REPLIED_SEQUENCE } } } });
  if (f.status === "rate") and.push({ quotedRateAt: { not: null } });
  if (f.status === "ready") {
    and.push({ OR: [{ quotedRateAt: { not: null } }, { contacts: { some: { sequences: { some: REPLIED_SEQUENCE } } } }] });
  }
  return and.length > 0 ? { AND: and } : {};
}

export function rosterOrderBy(sort: string): Prisma.CreatorOrderByWithRelationInput[] {
  switch (sort) {
    case "subscribers":
      return [{ subscriberCount: { sort: "desc", nulls: "last" } }];
    case "engagement":
      return [{ engagementRate: { sort: "desc", nulls: "last" } }];
    case "rate":
      return [{ quotedRateAmount: { sort: "asc", nulls: "last" } }];
    default:
      return [{ createdAt: "desc" }];
  }
}

export function rosterQueryString(f: RosterFilters, overrides: Partial<Record<keyof RosterFilters | "page", string>> = {}): string {
  const params = new URLSearchParams();
  const merged: Record<string, string> = { q: f.q, email: f.email, platform: f.platform, status: f.status, sort: f.sort === "recent" ? "" : f.sort, ...overrides };
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  return params.toString();
}

/**
 * Where the search matched, as a short quote — "In their reply: …did a smart lock review last…" —
 * so the team sees *why* a creator came up without opening them. Checks the most telling places
 * first: what they told us, then the work they've already published.
 */
export function matchSnippet(sources: { label: string; text: string | null | undefined }[], terms: string[], width = 90): { label: string; snippet: string } | null {
  if (terms.length === 0) return null;
  for (const { label, text } of sources) {
    if (!text) continue;
    const lower = text.toLowerCase();
    const term = terms.find((t) => lower.includes(t));
    if (!term) continue;
    const at = lower.indexOf(term);
    const start = Math.max(0, at - Math.floor((width - term.length) / 2));
    const end = Math.min(text.length, start + width);
    const body = text.slice(start, end).replace(/\s+/g, " ").trim();
    return { label, snippet: `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}` };
  }
  return null;
}
