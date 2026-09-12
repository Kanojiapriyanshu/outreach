import { prisma } from "@/lib/prisma";
import {
  searchChannels,
  getChannelsDetailsBatch,
  getRecentChannelVideoIds,
  getVideosStats,
  type SearchChannelsOptions,
} from "./api";
import { normalizeChannel, calculateCreatorAverage, type NormalizedChannel } from "./normalize";
import { extractChannelContact, type ExtractedPlatformLinks } from "./channelExtractor";

/** Every platform Discovery can detect and filter by — the single source of truth for both the
 * extractor's keys and the filter UI's checkboxes, so the two can never drift apart. */
export const PLATFORM_KEYS = ["instagram", "tiktok", "twitter", "pinterest", "facebook", "amazonStorefront"] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

/** search.list has no real boolean query language (no AND/OR/NOT) — running one call per phrase
 * and merging by channelId is how "unboxing" + "gadget review" + "tech deals" actually combines
 * into one broader search instead of one narrow one. Capped at 3: each phrase is its own 100-unit
 * call, so this is the one filter that directly multiplies cost rather than just narrowing results
 * for free. */
const MAX_QUERY_PHRASES = 3;
const MAX_SEARCH_HITS_PER_PHRASE = 50;

export interface DiscoveryFilters {
  /** Niche/keyword(s) — comma-separated phrases are each searched separately and merged (see
   * MAX_QUERY_PHRASES). Required, at least one non-empty phrase. */
  query: string;
  /** ISO 3166-1 alpha-2. Filters on the channel's own reported country (snippet.country) — NOT
   * search.list's regionCode, which only biases relevance and can't be trusted as a hard filter. */
  country?: string;
  /** BCP-47-ish language hint (e.g. "en", "hi") — passed to search.list's relevanceLanguage. */
  language?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  minAverageViews?: number;
  maxAverageViews?: number;
  /** 0-100. Requires the expensive per-channel engagement lookup, same as averageViews. */
  minEngagementRate?: number;
  /** "posted within the last N days." */
  postedWithinDays?: number;
  /** A channel must have AT LEAST ONE of these detected (OR, not AND) — "show me creators who
   * also do Instagram or TikTok" reads naturally as either, not both required. Free to apply: it
   * only reads the description already fetched by channels.list, no extra API call. */
  platforms?: PlatformKey[];
  /** How search.list itself orders raw hits before any of the filters above run. */
  sortOrder?: "relevance" | "viewCount" | "date";
  maxResults: number;
}

export interface DiscoveredCreator {
  /** The Creator row's own id, once upserted — always present in a runDiscoverySearch response,
   * optional only because callers that build one before the upsert runs don't have it yet. */
  creatorId?: string;
  channelId: string;
  title: string;
  description: string;
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
  /** How many channels matched every cheap filter (subscriber range, country, platform presence)
   * before the expensive engagement lookup and its own filters ran — shown so "asked for 20, got
   * 6" reads as "loosen your filters," not as a bug. */
  candidateCount: number;
  unitsUsed: number;
}

const SEARCH_UNIT_COST = 100;
const LOOKUP_UNIT_COST = 1;

/** Splits "unboxing, gadget review, tech deals" into up to MAX_QUERY_PHRASES distinct phrases. */
function parseQueryPhrases(query: string): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const raw of query.split(",")) {
    const phrase = raw.trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
    if (phrases.length >= MAX_QUERY_PHRASES) break;
  }
  return phrases;
}

function matchesAnyPlatform(platformLinks: ExtractedPlatformLinks, wanted: PlatformKey[] | undefined): boolean {
  if (!wanted || wanted.length === 0) return true;
  return wanted.some((key) => !!platformLinks[key]);
}

/**
 * Runs one full Discovery search end-to-end: one search.list call per keyword phrase (merged by
 * channelId), a single batched channels.list to resolve them, then the cheap in-memory filters
 * (subscriber range, country, platform presence — all readable from data already fetched) narrow
 * the field before the expensive per-channel step (recent-uploads engagement, same calculation
 * Insight OS already uses) runs only on survivors. Every result is upserted into the Creator table
 * by channelId, so the Library becomes a real, growing cache instead of the app re-discovering the
 * same channel from scratch on every search.
 */
export async function runDiscoverySearch(filters: DiscoveryFilters): Promise<DiscoverySearchResult> {
  const phrases = parseQueryPhrases(filters.query);
  if (phrases.length === 0) return { results: [], candidateCount: 0, unitsUsed: 0 };

  let unitsUsed = 0;

  const searchOpts: SearchChannelsOptions = {
    maxResults: MAX_SEARCH_HITS_PER_PHRASE,
    relevanceLanguage: filters.language,
    order: filters.sortOrder,
  };
  const searches = await Promise.all(phrases.map((phrase) => searchChannels(phrase, searchOpts)));
  unitsUsed += SEARCH_UNIT_COST * phrases.length;

  const seenChannelIds = new Set<string>();
  const mergedHits = searches.flatMap((s) => s.items).filter((hit) => {
    if (seenChannelIds.has(hit.channelId)) return false;
    seenChannelIds.add(hit.channelId);
    return true;
  });
  if (mergedHits.length === 0) {
    await recordUnitsUsed(unitsUsed);
    return { results: [], candidateCount: 0, unitsUsed };
  }

  // channels.list still only takes 50 ids per call — merging 3 phrases can turn up more unique
  // channels than that, so this stays a single call by capping the merged set rather than
  // chunking into several (a second lookup call is 1 more unit, cheap, but not worth the
  // complexity for what's still a "one page" search).
  const rawChannels = await getChannelsDetailsBatch(mergedHits.slice(0, 50).map((h) => h.channelId));
  unitsUsed += LOOKUP_UNIT_COST;

  const normalized = rawChannels.map(normalizeChannel);

  // Cheap filters + extraction, run on every candidate — none of this needs another API call, so
  // it happens before deciding who "survives" to the expensive engagement step.
  type Candidate = NormalizedChannel & { email: string | null; platformLinks: ExtractedPlatformLinks };
  const candidates: Candidate[] = normalized
    .filter((c) => {
      if (filters.country && c.country && c.country.toUpperCase() !== filters.country.toUpperCase()) return false;
      if (filters.minSubscribers && c.subscriberCount < filters.minSubscribers) return false;
      if (filters.maxSubscribers && c.subscriberCount > filters.maxSubscribers) return false;
      return true;
    })
    .map((c) => ({ ...c, ...extractChannelContact(c.description) }))
    .filter((c) => matchesAnyPlatform(c.platformLinks, filters.platforms));

  // A filter that can only be checked after the expensive per-channel lookup (freshness, average
  // views, engagement) means some survivors won't actually make the final cut — so when one of
  // those is active, more candidates get the expensive lookup than the plain maxResults ask,
  // rather than guaranteeing a near-empty result the moment any of them trims the list down.
  const needsComputedFilter = !!(filters.postedWithinDays || filters.minAverageViews || filters.maxAverageViews || filters.minEngagementRate);
  const survivorCap = needsComputedFilter ? Math.min(candidates.length, filters.maxResults * 2, 40) : filters.maxResults;
  const survivors = candidates.slice(0, survivorCap);

  const withEngagement = await Promise.all(
    survivors.map(async (channel): Promise<DiscoveredCreator | null> => {
      const videoIds = await getRecentChannelVideoIds(channel.uploadsPlaylistId, 10);
      unitsUsed += LOOKUP_UNIT_COST;
      const videos = videoIds.length > 0 ? await getVideosStats(videoIds) : [];
      if (videoIds.length > 0) unitsUsed += LOOKUP_UNIT_COST;
      const average = calculateCreatorAverage(videos, "");

      if (filters.postedWithinDays) {
        if (!average.lastPublishedAt) return null; // no uploads at all — can't be "within N days"
        const ageDays = (Date.now() - average.lastPublishedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > filters.postedWithinDays) return null;
      }
      const roundedAverageViews = Math.round(average.averageViews);
      if (filters.minAverageViews && roundedAverageViews < filters.minAverageViews) return null;
      if (filters.maxAverageViews && roundedAverageViews > filters.maxAverageViews) return null;
      if (filters.minEngagementRate && average.averageEngagementRate < filters.minEngagementRate) return null;

      return {
        channelId: channel.channelId,
        title: channel.title,
        description: channel.description,
        channelUrl: channel.channelUrl,
        thumbnailUrl: channel.thumbnailUrl,
        country: channel.country,
        subscriberCount: channel.subscriberCount,
        subscriberCountDisplay: channel.subscriberCountDisplay,
        averageViews: roundedAverageViews,
        engagementRate: average.averageEngagementRate,
        lastUploadAt: average.lastPublishedAt ? average.lastPublishedAt.toISOString() : null,
        email: channel.email,
        platformLinks: channel.platformLinks,
        alreadyInLibrary: false,
        existingInsightReportId: null,
      };
    })
  );

  const results = withEngagement.filter((r): r is DiscoveredCreator => r !== null).slice(0, filters.maxResults);

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
        const platformTags = Object.keys(r.platformLinks);
        const row = await prisma.creator.upsert({
          where: { channelId: r.channelId },
          create: {
            name: r.title,
            channelName: r.title,
            channelUrl: r.channelUrl,
            niche: phrases.join(", "),
            email: r.email,
            channelId: r.channelId,
            thumbnailUrl: r.thumbnailUrl,
            description: r.description,
            country: r.country || null,
            subscriberCount: r.subscriberCount,
            averageViews: r.averageViews,
            engagementRate: r.engagementRate,
            lastUploadAt: r.lastUploadAt ? new Date(r.lastUploadAt) : null,
            platformLinks: r.platformLinks as object,
            platformTags,
            discoverySource: "search",
            lastDiscoveredAt: new Date(),
          },
          // A repeat search refreshes the numbers and platform data, but never overwrites a name,
          // niche, or email the team may have already edited by hand after finding this creator.
          update: {
            thumbnailUrl: r.thumbnailUrl,
            description: r.description,
            country: r.country || null,
            subscriberCount: r.subscriberCount,
            averageViews: r.averageViews,
            engagementRate: r.engagementRate,
            lastUploadAt: r.lastUploadAt ? new Date(r.lastUploadAt) : null,
            platformLinks: r.platformLinks as object,
            platformTags,
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

/** A rough, conservative worst-case estimate shown before a search runs — actual cost is usually
 * lower (a merged multi-phrase search can turn up fewer than 50 unique channels per phrase, and
 * the engagement step only runs on survivors of the cheap filters), but the UI should never
 * surprise the team with a bigger number than what it quoted going in. */
export function estimateSearchUnits(filters: Pick<DiscoveryFilters, "query" | "maxResults" | "postedWithinDays" | "minAverageViews" | "maxAverageViews" | "minEngagementRate">): number {
  const phraseCount = Math.max(1, parseQueryPhrases(filters.query).length);
  const needsComputedFilter = !!(filters.postedWithinDays || filters.minAverageViews || filters.maxAverageViews || filters.minEngagementRate);
  const survivorCap = needsComputedFilter ? Math.min(filters.maxResults * 2, 40) : filters.maxResults;
  return phraseCount * SEARCH_UNIT_COST + LOOKUP_UNIT_COST + survivorCap * 2 * LOOKUP_UNIT_COST;
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
      description: channel.description,
      country: channel.country || null,
      subscriberCount: channel.subscriberCount,
      averageViews: Math.round(average.averageViews),
      engagementRate: average.averageEngagementRate,
      lastUploadAt: average.lastPublishedAt,
      platformLinks: platformLinks as object,
      platformTags: Object.keys(platformLinks),
      // A refresh only fills in an email that wasn't captured before — it never clears one the
      // team already has (including one they typed in by hand, which extraction can't know about).
      email: creator.email ?? email,
      lastDiscoveredAt: new Date(),
    },
  });

  await recordUnitsUsed(unitsUsed);
  return { ok: true };
}

export interface CreatorEditInput {
  email?: string | null;
  notes?: string | null;
  platformLinks?: ExtractedPlatformLinks;
}

/** Manual edits from the creator detail view — filling in an email or platform link extraction
 * missed, or leaving notes. Never touches the fields a re-search/refresh keeps live (subscriber
 * count, engagement, etc.). */
export async function updateCreatorDetails(creatorId: string, input: CreatorEditInput): Promise<RefreshCreatorResult> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) return { ok: false, error: "Not found" };

  const mergedPlatformLinks: ExtractedPlatformLinks | undefined = input.platformLinks
    ? { ...(creator.platformLinks as ExtractedPlatformLinks), ...input.platformLinks }
    : undefined;
  // An empty string in the merge means "clear this platform" — drop it rather than saving "".
  if (mergedPlatformLinks) {
    for (const key of Object.keys(mergedPlatformLinks) as PlatformKey[]) {
      if (!mergedPlatformLinks[key]) delete mergedPlatformLinks[key];
    }
  }

  await prisma.creator.update({
    where: { id: creatorId },
    data: {
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(mergedPlatformLinks
        ? { platformLinks: mergedPlatformLinks as object, platformTags: Object.keys(mergedPlatformLinks) }
        : {}),
    },
  });

  return { ok: true };
}
