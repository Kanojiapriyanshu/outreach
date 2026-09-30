import "server-only";
import { prisma } from "@/lib/prisma";
import { PUBLIC_ROSTER_WHERE, creatorCategories, topCategories } from "@/lib/publicRosterRules";

function handleFromUrl(url: string | null): string | null {
  const m = url ? /youtube\.com\/@([^/?#]+)/i.exec(url) : null;
  return m ? `@${decodeURIComponent(m[1])}` : null;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X",
  facebook: "Facebook",
  pinterest: "Pinterest",
};

/**
 * Everything the public roster shows — and nothing else. Rates, emails, notes and reply text are
 * deliberately never selected here: this page goes to every brand, not one.
 */
export async function loadPublicRoster(base: string) {
  const creators = await prisma.creator.findMany({
    where: PUBLIC_ROSTER_WHERE,
    orderBy: [{ subscriberCount: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: 1000,
    select: {
      id: true,
      name: true,
      channelName: true,
      channelUrl: true,
      thumbnailUrl: true,
      country: true,
      niche: true,
      contentHighlights: true,
      subscriberCount: true,
      averageViews: true,
      engagementRate: true,
      platformLinks: true,
      mediaKitShareToken: true,
    },
  });

  // A media kit link can be revoked on its own — only link the ones that still open.
  const tokens = creators.map((c) => c.mediaKitShareToken).filter((t): t is string => !!t);
  const liveKits = new Set(
    (await prisma.channelMediaKitShare.findMany({ where: { token: { in: tokens }, revokedAt: null }, select: { token: true } })).map((s) => s.token)
  );

  const rows = creators.map((c) => {
    const links = (c.platformLinks ?? {}) as Record<string, unknown>;
    return {
      id: c.id,
      name: c.channelName ?? c.name,
      handle: handleFromUrl(c.channelUrl),
      channelUrl: c.channelUrl,
      thumbnailUrl: c.thumbnailUrl,
      country: c.country,
      niches: creatorCategories({ niche: c.niche, contentHighlights: c.contentHighlights, name: c.channelName ?? c.name }),
      focus: c.contentHighlights ?? null,
      subscriberCount: c.subscriberCount,
      averageViews: c.averageViews,
      engagementRate: c.engagementRate,
      platforms: Object.entries(PLATFORM_LABELS)
        .filter(([key]) => typeof links[key] === "string" && /^https?:\/\//.test(links[key] as string))
        .map(([key, label]) => ({ key, label, url: links[key] as string })),
      mediaKitUrl: c.mediaKitShareToken && liveKits.has(c.mediaKitShareToken) ? `${base}/media-kit/shared/${c.mediaKitShareToken}` : null,
    };
  });

  const engagements = rows.map((r) => r.engagementRate).filter((e): e is number => e !== null && e > 0);
  const countries = new Set(rows.map((r) => r.country?.toUpperCase()).filter(Boolean));
  const onPlatform = (key: string) => rows.filter((r) => r.platforms.some((p) => p.key === key)).length;

  return {
    creators: rows,
    niches: topCategories(rows.map((r) => r.niches)),
    stats: {
      creators: rows.length,
      reach: rows.reduce((sum, r) => sum + (r.subscriberCount ?? 0), 0),
      viewsPerVideo: rows.reduce((sum, r) => sum + (r.averageViews ?? 0), 0),
      avgEngagement: engagements.length ? engagements.reduce((a, b) => a + b, 0) / engagements.length : null,
      countries: countries.size,
      mediaKits: rows.filter((r) => r.mediaKitUrl).length,
      onInstagram: onPlatform("instagram"),
      onTiktok: onPlatform("tiktok"),
    },
  };
}

export type PublicRoster = Awaited<ReturnType<typeof loadPublicRoster>>;
export type PublicRosterCreator = PublicRoster["creators"][number];
