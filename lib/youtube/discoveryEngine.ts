import { prisma } from "@/lib/prisma";
import {
  searchChannels,
  getChannelsDetailsBatch,
  getRecentChannelVideoIds,
  getVideosStats,
} from "./api";
import { normalizeChannel, calculateCreatorAverage } from "./normalize";
import { extractChannelContact, type ExtractedPlatformLinks } from "./channelExtractor";

export interface DiscoveryFilters {
  /** Niche/keyword — the actual search.list query. Required. */
  query: string;
  /** ISO 3166-1 alpha-2. Filters on the channel's own reported country (snippet.country) — NOT
   * search.list's regionCode, which only biases relevance and can't be trusted as a hard filter. */
  country?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  /** "posted within the last N days" — how many results at most to actually return; also caps how
   * many survivors get the expensive per-channel engagement lookup (see runDiscoverySearch). */
  postedWithinDays?: number;
  maxResults: number;
}

export interface DiscoveredCreator {
  /** The Creator row's own id, once upserted — always present in a runDiscoverySearch response,
   * optional only because callers that build one before the upsert runs don't have it yet. */
  creatorId?: string;
  channelId: string;
  title: string;
  channelUrl: string;
  thumbnailUrl: string;
  country: string;
  subscriberCount: number;
  subscriberCountDisplay: string;
  averageViews: number;
  engagementRate: number;
  lastUploadAt: string | null;
  email: string | null;
  platformLinks: ExtractedPlatformLinks;
  alreadyInLibrary: boolean;
  existingInsightReportId: string | null;
}

export interface DiscoverySearchResult {
  results: DiscoveredCreator[];
  /** How many of the raw search hits survived the subscriber-range filter — shown so "asked for
   * 20, got 6" reads as "loosen your filters," not as a bug. */
  candidateCount: number;
  unitsUsed: number;
}

const SEARCH_UNIT_COST = 100;
const LOOKUP_UNIT_COST = 1;

/**
 * Runs one full Discovery search end-to-end: search.list for candidates, a single batched
 * channels.list to resolve them, an in-memory subscriber-range filter, then — only for channels
 * still in the running, capped at filters.maxResults — the same recent-uploads-based engagement
 * calculation Insight OS already uses. Every result is upserted into the Creator table by
 * channelId, so the Library becomes a real, growing cache instead of the app re-discovering the
 * same channel from scratch on every search.
 *
 * One search.list page only (up to 50 raw hits) — no deep pagination. search.list costs 100
 * quota units per call regardless of how many results come back, so fetching a full page up front
 * and filtering it in memory is what makes tightening a subscriber/freshness filter free instead
 * of re-querying the API.
 */
export async function runDiscoverySearch(filters: DiscoveryFilters): Promise<DiscoverySearchResult> {
  const query = filters.query.trim();
  if (!query) return { results: [], candidateCount: 0, unitsUsed: 0 };

  let unitsUsed = 0;

  const search = await searchChannels(query, { maxResults: 50 });
  unitsUsed += SEARCH_UNIT_COST;
  if (search.items.length === 0) {
    await recordUnitsUsed(unitsUsed);
    return { results: [], candidateCount: 0, unitsUsed };
  }

  const rawChannels = await getChannelsDetailsBatch(search.items.map((h) => h.channelId));
  unitsUsed += LOOKUP_UNIT_COST;

  const normalized = rawChannels.map(normalizeChannel);

  const candidates = normalized.filter((c) => {
    if (filters.country && c.country && c.country.toUpperCase() !== filters.country.toUpperCase()) return false;
    if (filters.minSubscribers && c.subscriberCount < filters.minSubscribers) return false;
    if (filters.maxSubscribers && c.subscriberCount > filters.maxSubscribers) return false;
    return true;
  });

  const survivors = candidates.slice(0, filters.maxResults);

  // The expensive step — one playlistItems + one videos call per survivor — runs only on
  // channels that already passed every cheap filter, and only up to what was actually asked for.
  const withEngagement = await Promise.all(
    survivors.map(async (channel): Promise<DiscoveredCreator | null> => {
      const videoIds = await getRecentChannelVideoIds(channel.uploadsPlaylistId, 10);
      unitsUsed += LOOKUP_UNIT_COST;
      const videos = videoIds.length > 0 ? await getVideosStats(videoIds) : [];
      if (videoIds.length > 0) unitsUsed += LOOKUP_UNIT_COST;
      const average = calculateCreatorAverage(videos, "");

      if (filters.postedWithinDays && average.lastPublishedAt) {
        const ageDays = (Date.now() - average.lastPublishedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > filters.postedWithinDays) return null;
      } else if (filters.postedWithinDays && !average.lastPublishedAt) {
        // No recent uploads at all — can't be "within the last N days" by definition.
        return null;
      }

      const { email, platformLinks } = extractChannelContact(channel.description);

      return {
        channelId: channel.channelId,
        title: channel.title,
        channelUrl: channel.channelUrl,
        thumbnailUrl: channel.thumbnailUrl,
        country: channel.country,
        subscriberCount: channel.subscriberCount,
        subscriberCountDisplay: channel.subscriberCountDisplay,
        averageViews: Math.round(average.averageViews),
        engagementRate: average.averageEngagementRate,
        lastUploadAt: average.lastPublishedAt ? average.lastPublishedAt.toISOString() : null,
        email,
        platformLinks,
        alreadyInLibrary: false,
        existingInsightReportId: null,
      };
    })
  );

  const results = withEngagement.filter((r): r is DiscoveredCreator => r !== null);

  if (results.length > 0) {
    const channelIds = results.map((r) => r.channelId);
    const [existingCreators, existingReports] = await Promise.all([
      prisma.creator.findMany({ where: { channelId: { in: channelIds } }, select: { channelId: true } }),
      prisma.insightReport.findMany({ where: { channelId: { in: channelIds } }, select: { id: true, channelId: true }, orderBy: { createdAt: "desc" } }),
    ]);
    const existingChannelIds = new Set(existingCreators.map((c) => c.channelId));
    const reportByChannel = new Map(existingReports.map((r) => [r.channelId, r.id]));

    for (const r of results) {
      r.alreadyInLibrary = existingChannelIds.has(r.channelId);
      r.existingInsightReportId = reportByChannel.get(r.channelId) ?? null;
    }

    await Promise.all(
      results.map(async (r) => {
        const row = await prisma.creator.upsert({
          where: { channelId: r.channelId },
          create: {
            name: r.title,
            channelName: r.title,
            channelUrl: r.channelUrl,
            niche: query,
            email: r.email,
            channelId: r.channelId,
            thumbnailUrl: r.thumbnailUrl,
            country: r.country || null,
            subscriberCount: r.subscriberCount,
            averageViews: r.averageViews,
            engagementRate: r.engagementRate,
            lastUploadAt: r.lastUploadAt ? new Date(r.lastUploadAt) : null,
            platformLinks: r.platformLinks as object,
            discoverySource: "search",
            lastDiscoveredAt: new Date(),
          },
          // A repeat search refreshes the numbers and platform data, but never overwrites a name,
          // niche, or email the team may have already edited by hand after finding this creator.
          update: {
            thumbnailUrl: r.thumbnailUrl,
            country: r.country || null,
            subscriberCount: r.subscriberCount,
            averageViews: r.averageViews,
            engagementRate: r.engagementRate,
            lastUploadAt: r.lastUploadAt ? new Date(r.lastUploadAt) : null,
            platformLinks: r.platformLinks as object,
            lastDiscoveredAt: new Date(),
          },
        });
        r.creatorId = row.id;
        // The upsert may have kept an email the team already edited by hand instead of what
        // extraction found this time — reflect the row actually saved, not just what was scraped.
        r.email = row.email;
      })
    );
  }

  await recordUnitsUsed(unitsUsed);

  return { results, candidateCount: candidates.length, unitsUsed };
}

function todayKey(): string {
  // IST day boundary, matching the business's actual day rather than the server process's own
  // (UTC on Vercel) — same reasoning lib/quota.ts's startOfToday() uses for Gmail's daily limit,
  // just as a "YYYY-MM-DD" string here since this is a one-row-per-day counter, not a range query.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function recordUnitsUsed(units: number): Promise<void> {
  if (units <= 0) return;
  const date = todayKey();
  await prisma.youtubeApiUsage.upsert({
    where: { date },
    create: { date, units },
    update: { units: { increment: units } },
  });
}

export async function getUnitsUsedToday(): Promise<number> {
  const row = await prisma.youtubeApiUsage.findUnique({ where: { date: todayKey() } });
  return row?.units ?? 0;
}

export type RefreshCreatorResult = { ok: true } | { ok: false; error: string };

/** Re-fetches one Library entry's live stats on demand — subscriber counts and engagement drift,
 * and a search result upserted once could otherwise sit stale indefinitely between re-searches. */
export async function refreshCreator(creatorId: string): Promise<RefreshCreatorResult> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) return { ok: false, error: "Not found" };
  if (!creator.channelId) return { ok: false, error: "This creator wasn't added through Discovery, so there's no channel to refresh from." };

  const [raw] = await getChannelsDetailsBatch([creator.channelId]);
  let unitsUsed = LOOKUP_UNIT_COST;
  if (!raw) return { ok: false, error: "This channel no longer exists or is no longer public." };

  const channel = normalizeChannel(raw);
  const videoIds = await getRecentChannelVideoIds(channel.uploadsPlaylistId, 10);
  unitsUsed += LOOKUP_UNIT_COST;
  const videos = videoIds.length > 0 ? await getVideosStats(videoIds) : [];
  if (videoIds.length > 0) unitsUsed += LOOKUP_UNIT_COST;
  const average = calculateCreatorAverage(videos, "");
  const { email, platformLinks } = extractChannelContact(channel.description);

  await prisma.creator.update({
    where: { id: creatorId },
    data: {
      thumbnailUrl: channel.thumbnailUrl,
      country: channel.country || null,
      subscriberCount: channel.subscriberCount,
      averageViews: Math.round(average.averageViews),
      engagementRate: average.averageEngagementRate,
      lastUploadAt: average.lastPublishedAt,
      platformLinks: platformLinks as object,
      // A refresh only fills in an email that wasn't captured before — it never clears one the
      // team already has (including one they typed in by hand, which extraction can't know about).
      email: creator.email ?? email,
      lastDiscoveredAt: new Date(),
    },
  });

  await recordUnitsUsed(unitsUsed);
  return { ok: true };
}
