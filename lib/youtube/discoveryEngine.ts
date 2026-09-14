import { prisma } from "@/lib/prisma";
import {
  searchChannels,
  getChannelsDetailsBatch,
  getRecentChannelVideoIds,
  getVideosStats,
  type SearchChannelsOptions,
} from "./api";
import { normalizeChannel, normalizeVideo, calculateCreatorAverage, type NormalizedChannel, type NormalizedVideo } from "./normalize";
import { extractChannelContact, type ExtractedPlatformLinks } from "./channelExtractor";
import { estimateAudienceDemographics } from "./audienceEstimation";
import {
  splitKeywordIntoPhrases,
  expandKeywords,
  computeRelevance,
  computeQualityScore,
  computeConsistency,
  computeBrandSafety,
  computeSponsorshipFrequencyPercent,
  computeContentFormatMix,
  computeUploadsInLastDays,
  countryMatchConfidence,
  countryConfidenceRank,
  detectChannelKind,
  matchesAnyTier,
  sizeTierLabel,
  median,
  type CountryConfidence,
  type ChannelKind,
} from "./creatorSignals";

/** Every platform Discovery can detect and filter by — the single source of truth for both the
 * extractor's keys and the filter UI's checkboxes, so the two can never drift apart. */
export const PLATFORM_KEYS = ["instagram", "tiktok", "twitter", "pinterest", "facebook", "amazonStorefront"] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

/** search.list has no real boolean query language (no AND/OR/NOT) — running one call per phrase
 * and merging by channelId is how "unboxing" + "gadget review" + "tech deals" actually combines
 * into one broader search instead of one narrow one. Capped at 5: each phrase is its own 100-unit
 * call, so this is the one filter that directly multiplies cost rather than just narrowing results
 * for free. */
const MAX_QUERY_PHRASES = 5;
const MAX_SEARCH_HITS_PER_PHRASE = 50;
/** channels.list takes 50 ids per call but only costs 1 unit, so widening the candidate pool past
 * one call is nearly free — the expensive step is the per-channel video lookup further down, which
 * only ever runs on the best-ranked survivors. */
const CHANNELS_LOOKUP_CHUNK = 50;
const MAX_CANDIDATE_CHANNELS = 150;
/** Recent uploads sampled per surviving channel. Enough to read engagement, cadence, sponsorship
 * frequency and format mix from, without paying for a full media-kit-sized sample on every hit. */
const RECENT_SAMPLE_SIZE = 10;
/**
 * Keyword relevance alone will happily rank a 1-subscriber channel first — its name and every
 * upload are about exactly the searched thing, so it scores a perfect match while being no use to
 * a brand at all. The lowest size band Discovery even offers starts at 1K, so anything below that
 * is outside every tier the UI advertises; this makes the floor real instead of leaving it implied.
 * An explicit minSubscribers (however low) overrides it — asking for tiny channels on purpose is a
 * legitimate search, being handed them by default is not.
 */
const DEFAULT_MIN_SUBSCRIBERS = 1_000;

export type DiscoverySortBy = "relevance" | "quality" | "subscribers" | "engagement" | "avgViews" | "recentUpload";

export interface DiscoveryFilters {
  /** Niche/keyword(s). Comma-separated phrases are each searched separately and merged; a run-on
   * phrase is also split at its terminator words ("x review y review" → two searches). */
  query: string;
  /** Also search the "<keyword> review / unboxing / best <keyword>" shapes creators actually title
   * videos with. Costs one extra 100-unit search.list call per added phrase. */
  expandKeywords?: boolean;
  /** ISO 3166-1 alpha-2. Filters on the channel's own reported country (snippet.country) — NOT
   * search.list's regionCode, which only biases relevance and can't be trusted as a hard filter.
   * Channels that declare no country are kept (most don't declare one) and ranked below verified
   * matches rather than being silently dropped. */
  country?: string;
  /** BCP-47-ish language hint (e.g. "en", "hi") — passed to search.list's relevanceLanguage. */
  language?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  /** Industry size bands, OR'd together — "nano or mega, nothing in between" is a real
   * shortlisting pattern that a single min/max range can't express. */
  subscriberTiers?: string[];
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
  /** Only creators with a contact email found in their About text — the difference between a
   * shortlist you can act on today and one that needs manual digging first. */
  hasEmail?: boolean;
  /** 0-100 floor on the brand-safety scan of recent uploads. */
  minBrandSafety?: number;
  /** Minimum share of recent uploads carrying sponsorship markers — "has demonstrably worked with
   * brands before", which predicts a smoother deal than a first-time creator. */
  minSponsorshipFrequency?: number;
  /** Drop brand-owned and news/publisher channels. A brand's own channel is the classic keyword
   * false positive: perfectly on-topic, and impossible to sponsor. */
  excludeBrandChannels?: boolean;
  /** Category keys from the same benchmark engine the media kit uses (technology, gaming, …), so a
   * creator filtered here resolves to the same category their media kit will show. */
  categories?: string[];
  /** How search.list itself orders raw hits before any of the filters below run. */
  sortOrder?: "relevance" | "viewCount" | "date";
  /** How the final, fully-scored results are ordered. Distinct from sortOrder, which only steers
   * what YouTube hands back before any of this app's own scoring exists. */
  sortBy?: DiscoverySortBy;
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
  totalViewCount: number;
  videoCount: number;
  averageViews: number;
  medianViews: number;
  engagementRate: number;
  lastUploadAt: string | null;
  email: string | null;
  platformLinks: ExtractedPlatformLinks;
  alreadyInLibrary: boolean;
  existingInsightReportId: string | null;
  /** Most recent whole-channel media kit already generated for this channel, if any — see
   * lib/youtube/channelMediaKit.ts. A fresh one is created on demand, not upserted, so this is
   * always the latest rather than a single canonical row. */
  existingMediaKitId: string | null;

  /* ---- Scoring, all computed from the sampled uploads (see lib/youtube/creatorSignals.ts) ---- */
  /** 0-100, how strongly this creator's own content matches what was searched. */
  relevanceScore: number;
  /** The searched terms actually found — shown so a ranking is explainable rather than a vibe. */
  matchedTerms: string[];
  /** 0-100, engagement + real reach + consistency + safety + recency. Size deliberately excluded. */
  qualityScore: number;
  brandSafetyLabel: string;
  brandSafetyScore: number;
  sponsorshipFrequencyPercent: number;
  uploadsLast90Days: number;
  shortsPercent: number;
  /** Resolved content category, same engine the media kit's audience benchmark uses. */
  category: string;
  countryConfidence: CountryConfidence;
  channelKind: ChannelKind;
  sizeTier: string;
}

export interface DiscoverySearchResult {
  results: DiscoveredCreator[];
  /** How many channels matched every cheap filter (subscriber range, country, platform presence)
   * before the expensive engagement lookup and its own filters ran — shown so "asked for 20, got
   * 6" reads as "loosen your filters," not as a bug. */
  candidateCount: number;
  /** The phrases actually searched, after splitting and expansion — so the user can see that
   * "drone review" quietly also searched "best drone" and judge the unit cost against it. */
  searchedPhrases: string[];
  unitsUsed: number;
}

const SEARCH_UNIT_COST = 100;
const LOOKUP_UNIT_COST = 1;

/**
 * Splits "unboxing, gadget review, tech deals" into distinct phrases, and additionally splits each
 * comma-section at its terminator words so a run-on query typed as one line still becomes the
 * several searches the user meant. Capped at MAX_QUERY_PHRASES.
 */
function parseQueryPhrases(query: string): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const section of query.split(",")) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    for (const phrase of splitKeywordIntoPhrases(trimmed)) {
      const key = phrase.toLowerCase();
      if (!phrase || seen.has(key)) continue;
      seen.add(key);
      phrases.push(phrase);
      if (phrases.length >= MAX_QUERY_PHRASES) return phrases;
    }
  }
  return phrases;
}

function matchesAnyPlatform(platformLinks: ExtractedPlatformLinks, wanted: PlatformKey[] | undefined): boolean {
  if (!wanted || wanted.length === 0) return true;
  return wanted.some((key) => !!platformLinks[key]);
}

/** channels.list caps at 50 ids per call, so a candidate pool wider than that needs chunking —
 * each chunk is only 1 unit, which is what makes a 150-channel pool affordable at all. */
async function fetchChannelsChunked(channelIds: string[]): Promise<{ channels: Record<string, unknown>[]; calls: number }> {
  const chunks: string[][] = [];
  for (let i = 0; i < channelIds.length; i += CHANNELS_LOOKUP_CHUNK) {
    chunks.push(channelIds.slice(i, i + CHANNELS_LOOKUP_CHUNK));
  }
  const batches = await Promise.all(chunks.map((chunk) => getChannelsDetailsBatch(chunk)));
  return { channels: batches.flat(), calls: chunks.length };
}

function sortResults(results: DiscoveredCreator[], sortBy: DiscoverySortBy | undefined): DiscoveredCreator[] {
  const sorted = [...results];
  switch (sortBy) {
    case "quality":
      return sorted.sort((a, b) => b.qualityScore - a.qualityScore || b.relevanceScore - a.relevanceScore);
    case "subscribers":
      return sorted.sort((a, b) => b.subscriberCount - a.subscriberCount);
    case "engagement":
      return sorted.sort((a, b) => b.engagementRate - a.engagementRate);
    case "avgViews":
      return sorted.sort((a, b) => b.averageViews - a.averageViews);
    case "recentUpload":
      return sorted.sort((a, b) => (b.lastUploadAt ?? "").localeCompare(a.lastUploadAt ?? ""));
    case "relevance":
    default:
      // Country confidence outranks relevance when a country was asked for: an on-topic creator in
      // the wrong market is the wrong answer to "find me US tech reviewers", however well they match
      // the keywords.
      return sorted.sort(
        (a, b) =>
          countryConfidenceRank(b.countryConfidence) - countryConfidenceRank(a.countryConfidence) ||
          b.relevanceScore - a.relevanceScore ||
          b.qualityScore - a.qualityScore
      );
  }
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
  const basePhrases = parseQueryPhrases(filters.query);
  if (basePhrases.length === 0) return { results: [], candidateCount: 0, searchedPhrases: [], unitsUsed: 0 };

  const phrases = filters.expandKeywords ? expandKeywords(basePhrases, MAX_QUERY_PHRASES - basePhrases.length) : basePhrases;

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
    return { results: [], candidateCount: 0, searchedPhrases: phrases, unitsUsed };
  }

  const { channels: rawChannels, calls } = await fetchChannelsChunked(mergedHits.slice(0, MAX_CANDIDATE_CHANNELS).map((h) => h.channelId));
  unitsUsed += LOOKUP_UNIT_COST * calls;

  const normalized = rawChannels.map(normalizeChannel);

  // Cheap filters + extraction + a first-pass relevance read, all on data already fetched — none
  // of this needs another API call, so it happens before deciding who "survives" to the expensive
  // per-channel step.
  type Candidate = NormalizedChannel & {
    email: string | null;
    platformLinks: ExtractedPlatformLinks;
    channelKind: ChannelKind;
    countryConfidence: CountryConfidence;
    preliminaryRelevance: number;
  };
  const minSubscribers = filters.minSubscribers ?? DEFAULT_MIN_SUBSCRIBERS;
  const candidates: Candidate[] = normalized
    .filter((c) => {
      // A declared country that isn't the target is a real mismatch; no declared country at all is
      // not — most channels leave it unset, and dropping them would hide most of YouTube.
      if (filters.country && c.country && c.country.toUpperCase() !== filters.country.toUpperCase()) return false;
      if (c.subscriberCount < minSubscribers) return false;
      if (filters.maxSubscribers && c.subscriberCount > filters.maxSubscribers) return false;
      if (!matchesAnyTier(c.subscriberCount, filters.subscriberTiers)) return false;
      return true;
    })
    .map((c) => {
      const contact = extractChannelContact(c.description);
      const channelKind = detectChannelKind(c.title, c.description);
      return {
        ...c,
        ...contact,
        channelKind,
        countryConfidence: countryMatchConfidence(c.country, filters.country),
        preliminaryRelevance: computeRelevance({
          channelText: `${c.title} ${c.description}`,
          videoTexts: [],
          phrases: basePhrases,
        }).score,
      };
    })
    .filter((c) => matchesAnyPlatform(c.platformLinks, filters.platforms))
    .filter((c) => (filters.hasEmail ? !!c.email : true))
    .filter((c) => (filters.excludeBrandChannels ? c.channelKind === "creator" : true));

  // A filter that can only be checked after the expensive per-channel lookup (freshness, average
  // views, engagement, brand safety, sponsorship history, category) means some survivors won't
  // actually make the final cut — so when one of those is active, more candidates get the expensive
  // lookup than the plain maxResults ask, rather than guaranteeing a near-empty result the moment
  // any of them trims the list down.
  const needsComputedFilter = !!(
    filters.postedWithinDays ||
    filters.minAverageViews ||
    filters.maxAverageViews ||
    filters.minEngagementRate ||
    filters.minBrandSafety ||
    filters.minSponsorshipFrequency ||
    (filters.categories && filters.categories.length > 0)
  );
  const survivorCap = needsComputedFilter ? Math.min(candidates.length, filters.maxResults * 2, 40) : Math.min(candidates.length, filters.maxResults);

  // Spend the expensive lookup on the most on-topic candidates rather than on whatever order
  // YouTube happened to return — with a pool this wide, "the first 20" and "the 20 that best match
  // what was asked for" are very different sets.
  const survivors = [...candidates].sort((a, b) => b.preliminaryRelevance - a.preliminaryRelevance).slice(0, survivorCap);

  const withEngagement = await Promise.all(
    survivors.map(async (channel): Promise<DiscoveredCreator | null> => {
      const videoIds = await getRecentChannelVideoIds(channel.uploadsPlaylistId, RECENT_SAMPLE_SIZE);
      unitsUsed += LOOKUP_UNIT_COST;
      const rawVideos = videoIds.length > 0 ? await getVideosStats(videoIds) : [];
      if (videoIds.length > 0) unitsUsed += LOOKUP_UNIT_COST;
      // calculateCreatorAverage normalizes internally and wants the raw API objects; everything
      // else here reads the normalized shape, so both forms are kept rather than re-deriving.
      const average = calculateCreatorAverage(rawVideos, "");
      const videos: NormalizedVideo[] = rawVideos.map(normalizeVideo);

      if (filters.postedWithinDays) {
        if (!average.lastPublishedAt) return null; // no uploads at all — can't be "within N days"
        const ageDays = (Date.now() - average.lastPublishedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > filters.postedWithinDays) return null;
      }
      const roundedAverageViews = Math.round(average.averageViews);
      if (filters.minAverageViews && roundedAverageViews < filters.minAverageViews) return null;
      if (filters.maxAverageViews && roundedAverageViews > filters.maxAverageViews) return null;
      if (filters.minEngagementRate && average.averageEngagementRate < filters.minEngagementRate) return null;

      const { label: brandSafetyLabel, score: brandSafetyScore } = computeBrandSafety(videos);
      if (filters.minBrandSafety && brandSafetyScore < filters.minBrandSafety) return null;

      const sponsorshipFrequencyPercent = computeSponsorshipFrequencyPercent(videos);
      if (filters.minSponsorshipFrequency && sponsorshipFrequencyPercent < filters.minSponsorshipFrequency) return null;

      const { shortsPercent } = computeContentFormatMix(videos);

      // Same resolver the media kit's audience benchmark uses, so a creator filtered as "gaming"
      // here is the same category their media kit will print.
      const category = estimateAudienceDemographics({
        tags: videos.flatMap((v) => v.tags),
        topics: videos.map((v) => v.categoryName).filter(Boolean),
        contentText: [channel.description, ...videos.map((v) => v.title)].filter(Boolean).join(" "),
        shortsPercentage: shortsPercent,
      }).categoryLabel;
      if (filters.categories && filters.categories.length > 0 && !filters.categories.includes(category)) return null;

      const daysSinceLastUpload = average.lastPublishedAt ? (Date.now() - average.lastPublishedAt.getTime()) / (1000 * 60 * 60 * 24) : null;
      const viewToSubscriberRate = channel.subscriberCount > 0 ? (roundedAverageViews / channel.subscriberCount) * 100 : 0;

      // Re-scored now that the uploads are in hand — what a creator actually publishes is far
      // stronger evidence than what their channel blurb claims.
      const relevance = computeRelevance({
        channelText: `${channel.title} ${channel.description}`,
        videoTexts: videos.map((v) => `${v.title} ${v.description}`),
        phrases: basePhrases,
      });

      return {
        channelId: channel.channelId,
        title: channel.title,
        description: channel.description,
        channelUrl: channel.channelUrl,
        thumbnailUrl: channel.thumbnailUrl,
        country: channel.country,
        subscriberCount: channel.subscriberCount,
        subscriberCountDisplay: channel.subscriberCountDisplay,
        totalViewCount: channel.totalViewCount,
        videoCount: channel.videoCount,
        averageViews: roundedAverageViews,
        medianViews: median(videos.map((v) => v.viewCount)),
        engagementRate: average.averageEngagementRate,
        lastUploadAt: average.lastPublishedAt ? average.lastPublishedAt.toISOString() : null,
        email: channel.email,
        platformLinks: channel.platformLinks,
        alreadyInLibrary: false,
        existingInsightReportId: null,
        existingMediaKitId: null,
        relevanceScore: relevance.score,
        matchedTerms: relevance.matchedTerms,
        qualityScore: computeQualityScore({
          engagementRate: average.averageEngagementRate,
          viewToSubscriberRate,
          consistency: computeConsistency(videos),
          brandSafetyScore,
          daysSinceLastUpload,
        }),
        brandSafetyLabel,
        brandSafetyScore,
        sponsorshipFrequencyPercent,
        uploadsLast90Days: computeUploadsInLastDays(videos, 90),
        shortsPercent,
        category,
        countryConfidence: channel.countryConfidence,
        channelKind: channel.channelKind,
        sizeTier: sizeTierLabel(channel.subscriberCount),
      };
    })
  );

  const results = sortResults(
    withEngagement.filter((r): r is DiscoveredCreator => r !== null),
    filters.sortBy
  ).slice(0, filters.maxResults);

  if (results.length > 0) {
    const channelIds = results.map((r) => r.channelId);
    const [existingCreators, existingReports, existingMediaKits] = await Promise.all([
      prisma.creator.findMany({ where: { channelId: { in: channelIds } }, select: { channelId: true } }),
      prisma.insightReport.findMany({ where: { channelId: { in: channelIds } }, select: { id: true, channelId: true }, orderBy: { createdAt: "desc" } }),
      prisma.channelMediaKit.findMany({ where: { channelId: { in: channelIds } }, select: { id: true, channelId: true }, orderBy: { createdAt: "desc" } }),
    ]);
    const existingChannelIds = new Set(existingCreators.map((c) => c.channelId));
    const reportByChannel = new Map(existingReports.map((r) => [r.channelId, r.id]));
    const mediaKitByChannel = new Map(existingMediaKits.map((m) => [m.channelId, m.id]));

    for (const r of results) {
      r.alreadyInLibrary = existingChannelIds.has(r.channelId);
      r.existingInsightReportId = reportByChannel.get(r.channelId) ?? null;
      r.existingMediaKitId = mediaKitByChannel.get(r.channelId) ?? null;
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
            // The phrases the user actually typed — auto-expanded variants are a search-time
            // widening trick, not something to record as this creator's niche.
            niche: basePhrases.join(", "),
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

  return { results, candidateCount: candidates.length, searchedPhrases: phrases, unitsUsed };
}

function todayKey(): string {
  // IST day boundary, matching the business's actual day rather than the server process's own
  // (UTC on Vercel) — same reasoning lib/quota.ts's startOfToday() uses for Gmail's daily limit,
  // just as a "YYYY-MM-DD" string here since this is a one-row-per-day counter, not a range query.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function recordUnitsUsed(units: number): Promise<void> {
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
export function estimateSearchUnits(
  filters: Pick<
    DiscoveryFilters,
    | "query"
    | "maxResults"
    | "expandKeywords"
    | "postedWithinDays"
    | "minAverageViews"
    | "maxAverageViews"
    | "minEngagementRate"
    | "minBrandSafety"
    | "minSponsorshipFrequency"
    | "categories"
  >
): number {
  const basePhrases = parseQueryPhrases(filters.query);
  const phraseCount = Math.max(1, (filters.expandKeywords ? expandKeywords(basePhrases, MAX_QUERY_PHRASES - basePhrases.length) : basePhrases).length);
  const needsComputedFilter = !!(
    filters.postedWithinDays ||
    filters.minAverageViews ||
    filters.maxAverageViews ||
    filters.minEngagementRate ||
    filters.minBrandSafety ||
    filters.minSponsorshipFrequency ||
    (filters.categories && filters.categories.length > 0)
  );
  const survivorCap = needsComputedFilter ? Math.min(filters.maxResults * 2, 40) : filters.maxResults;
  const lookupCalls = Math.ceil(Math.min(phraseCount * MAX_SEARCH_HITS_PER_PHRASE, MAX_CANDIDATE_CHANNELS) / CHANNELS_LOOKUP_CHUNK);
  return phraseCount * SEARCH_UNIT_COST + lookupCalls * LOOKUP_UNIT_COST + survivorCap * 2 * LOOKUP_UNIT_COST;
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

export interface DemographicSliceInput {
  label: string;
  percent: number;
}

export interface CreatorEditInput {
  email?: string | null;
  notes?: string | null;
  platformLinks?: ExtractedPlatformLinks;
  /** Real numbers transcribed from the creator's own YouTube Studio analytics — see the schema
   * comment on Creator.audienceCountries for why these are never inferred. `undefined` leaves the
   * existing value alone; an array (including empty) replaces it outright. */
  audienceCountries?: DemographicSliceInput[];
  audienceAgeRanges?: DemographicSliceInput[];
  audienceGenderSplit?: DemographicSliceInput[];
  audienceDevices?: DemographicSliceInput[];
}

function sanitizeSlices(slices: DemographicSliceInput[] | undefined): DemographicSliceInput[] | undefined {
  if (!slices) return undefined;
  return slices
    .map((s) => ({ label: String(s.label ?? "").trim(), percent: Number(s.percent) }))
    .filter((s) => s.label && Number.isFinite(s.percent) && s.percent > 0 && s.percent <= 100);
}

/** Manual edits from the creator detail view — filling in an email or platform link extraction
 * missed, real audience demographics the creator shared directly, or leaving notes. Never touches
 * the fields a re-search/refresh keeps live (subscriber count, engagement, etc.). */
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

  const audienceCountries = sanitizeSlices(input.audienceCountries);
  const audienceAgeRanges = sanitizeSlices(input.audienceAgeRanges);
  const audienceGenderSplit = sanitizeSlices(input.audienceGenderSplit);
  const audienceDevices = sanitizeSlices(input.audienceDevices);

  await prisma.creator.update({
    where: { id: creatorId },
    data: {
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(mergedPlatformLinks
        ? { platformLinks: mergedPlatformLinks as object, platformTags: Object.keys(mergedPlatformLinks) }
        : {}),
      ...(audienceCountries !== undefined ? { audienceCountries: audienceCountries as object } : {}),
      ...(audienceAgeRanges !== undefined ? { audienceAgeRanges: audienceAgeRanges as object } : {}),
      ...(audienceGenderSplit !== undefined ? { audienceGenderSplit: audienceGenderSplit as object } : {}),
      ...(audienceDevices !== undefined ? { audienceDevices: audienceDevices as object } : {}),
    },
  });

  return { ok: true };
}
