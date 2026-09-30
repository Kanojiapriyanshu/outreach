/**
 * Who goes on the public creator roster — the page shared with every brand to show who Fidem works
 * with — and how their niches are grouped for its filters. Pure (Prisma types only) so the rules are
 * shared by the public page, the admin tab and the tests.
 */
import type { Prisma } from "@/app/generated/prisma/client";

/** Pipeline stages that mean a creator said yes to working with us. */
export const ROSTER_STAGES = ["INTERESTED", "RATE_RECEIVED", "NEGOTIATION", "CREATOR_SELECTED", "DEAL"] as const;

/**
 * Interested or rate received — through an outreach thread here, or a rate agreed directly in Gmail
 * — and never asked to stop being contacted. Hidden creators still qualify; the public page filters
 * them out separately so the admin tab can list them.
 */
export const ROSTER_ELIGIBLE: Prisma.CreatorWhereInput = {
  OR: [
    { quotedRateAt: { not: null } },
    { contacts: { some: { sequences: { some: { deletedAt: null, stage: { in: [...ROSTER_STAGES] } } } } } },
  ],
  NOT: { contacts: { some: { sequences: { some: { status: "UNSUBSCRIBED" } } } } },
};

export const PUBLIC_ROSTER_WHERE: Prisma.CreatorWhereInput = { AND: [ROSTER_ELIGIBLE, { rosterHidden: false }] };

/**
 * The categories a brand browses the roster by. Creator.niche is usually the keyword list of the
 * search that found them ("tech, gadget, gaming, desk, gaming chair, …" — identical for everyone
 * from that search), so it can't be shown as-is: each creator is mapped onto these instead, from
 * the leading niche terms, what their recent videos are about, and their channel name.
 */
export const ROSTER_CATEGORIES: { tag: string; pattern: RegExp }[] = [
  { tag: "Tech", pattern: /\btech|gadget|electronic|headphone|earbud|speaker|\bai\b|unbox|smart home/i },
  { tag: "Gaming", pattern: /\bgam(e|es|ing|er)\b|gaming setup/i },
  { tag: "Beauty", pattern: /beauty|skincare|makeup|grwm|self-care/i },
  { tag: "Fashion", pattern: /fashion|outfit|clothing|dress|styling/i },
  { tag: "Home & living", pattern: /\bhome\b|d[ée]cor|interior|furniture|apartment|organi[sz]ation|living room|cozy/i },
  { tag: "3D printing & making", pattern: /print|maker|\bdiy\b|engineer|robotic|how to/i },
  { tag: "Fitness", pattern: /fitness|\bgym|treadmill|walking pad|workout/i },
  { tag: "Lifestyle", pattern: /lifestyle|vlog|day-in-the-life|travel|wellness/i },
  { tag: "Product reviews", pattern: /product review|reviews?\b/i },
];

/** Up to three categories for one creator, the ones their leading niche terms point to first. */
export function creatorCategories(c: { niche: string | null; contentHighlights?: string | null; name?: string | null }): string[] {
  const leading = (c.niche ?? "").split(",").slice(0, 2).join(" ");
  const sources = [leading, c.contentHighlights ?? "", c.name ?? ""];
  const found: string[] = [];
  for (const text of sources) {
    for (const { tag, pattern } of ROSTER_CATEGORIES) {
      if (!found.includes(tag) && pattern.test(text)) found.push(tag);
    }
  }
  // Reviews only earns a tag when nothing more specific did.
  const specific = found.filter((t) => t !== "Product reviews");
  return (specific.length ? specific : found).slice(0, 3);
}

/** Category chips for the roster filters — most creators first, only categories someone is in. */
export function topCategories(categoryLists: string[][], limit = 10): { tag: string; slug: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const list of categoryLists) for (const tag of list) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, slug: slugTag(tag), count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export function slugTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
