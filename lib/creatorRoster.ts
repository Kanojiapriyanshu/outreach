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

export function rosterWhere(f: RosterFilters): Prisma.CreatorWhereInput {
  const and: Prisma.CreatorWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { channelName: { contains: f.q, mode: "insensitive" } },
        { email: { contains: f.q, mode: "insensitive" } },
        { niche: { contains: f.q, mode: "insensitive" } },
        { contentHighlights: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  if (f.email === "has") and.push({ email: { not: null } });
  if (f.email === "missing") and.push({ email: null });
  if (f.platform) and.push({ platformTags: { has: f.platform } });
  if (f.status === "not-contacted") and.push({ contacts: { none: { sequences: { some: LIVE_SEQUENCE } } } });
  if (f.status === "contacted") and.push({ contacts: { some: { sequences: { some: LIVE_SEQUENCE } } } });
  if (f.status === "replied") {
    and.push({
      contacts: {
        some: {
          sequences: {
            some: { ...LIVE_SEQUENCE, OR: [{ lastReplyAt: { not: null } }, { status: { in: ["REPLIED", "UNSUBSCRIBED"] } }] },
          },
        },
      },
    });
  }
  if (f.status === "rate") and.push({ quotedRateAt: { not: null } });
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
