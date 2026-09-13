import { NextRequest, NextResponse } from "next/server";
import { runDiscoverySearch, getUnitsUsedToday, PLATFORM_KEYS, type PlatformKey, type DiscoverySortBy } from "@/lib/youtube/discoveryEngine";
import { SUBSCRIBER_TIERS } from "@/lib/youtube/creatorSignals";
import { AUDIENCE_CATEGORY_KEYS } from "@/lib/youtube/audienceEstimation";

interface SearchBody {
  query?: string;
  expandKeywords?: boolean;
  country?: string;
  language?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  subscriberTiers?: string[];
  minAverageViews?: number;
  maxAverageViews?: number;
  minEngagementRate?: number;
  postedWithinDays?: number;
  platforms?: string[];
  hasEmail?: boolean;
  minBrandSafety?: number;
  minSponsorshipFrequency?: number;
  excludeBrandChannels?: boolean;
  categories?: string[];
  sortOrder?: "relevance" | "viewCount" | "date";
  sortBy?: DiscoverySortBy;
  maxResults?: number;
}

const VALID_PLATFORMS = new Set<string>(PLATFORM_KEYS);
const VALID_SORT_ORDERS = new Set(["relevance", "viewCount", "date"]);
const VALID_SORT_BY = new Set<string>(["relevance", "quality", "subscribers", "engagement", "avgViews", "recentUpload"]);
const VALID_TIERS = new Set(SUBSCRIBER_TIERS.map((t) => t.key));
const VALID_CATEGORIES = new Set(AUDIENCE_CATEGORY_KEYS);

/** Keeps an out-of-range or non-numeric value out of the engine entirely rather than letting it
 * become a filter nobody asked for (a stray 0 reads as "no filter", NaN as "reject everything"). */
function optionalNumber(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.max(n, min), max);
}

/**
 * Runs a live Discovery search and returns fresh, scored results. Every result is also upserted
 * into the Creator table by channelId inside runDiscoverySearch — the Library is warmed by this
 * route automatically, not by a separate "save" step.
 */
export async function POST(req: NextRequest) {
  const body: SearchBody = await req.json();
  const query = body.query?.trim() ?? "";
  if (!query) return NextResponse.json({ error: "Enter a niche or keyword to search for" }, { status: 400 });

  const maxResults = Math.min(Math.max(Number(body.maxResults) || 20, 5), 50);
  const platforms = (body.platforms ?? []).filter((p): p is PlatformKey => VALID_PLATFORMS.has(p));
  const subscriberTiers = (body.subscriberTiers ?? []).filter((t) => VALID_TIERS.has(t));
  const categories = (body.categories ?? []).filter((c) => VALID_CATEGORIES.has(c));
  const sortOrder = VALID_SORT_ORDERS.has(body.sortOrder ?? "") ? body.sortOrder : undefined;
  const sortBy = VALID_SORT_BY.has(body.sortBy ?? "") ? body.sortBy : "relevance";

  try {
    const { results, candidateCount, searchedPhrases, unitsUsed } = await runDiscoverySearch({
      query,
      expandKeywords: !!body.expandKeywords,
      country: body.country?.trim() || undefined,
      language: body.language?.trim() || undefined,
      minSubscribers: optionalNumber(body.minSubscribers, 1, 1_000_000_000),
      maxSubscribers: optionalNumber(body.maxSubscribers, 1, 1_000_000_000),
      subscriberTiers: subscriberTiers.length > 0 ? subscriberTiers : undefined,
      minAverageViews: optionalNumber(body.minAverageViews, 1, 1_000_000_000),
      maxAverageViews: optionalNumber(body.maxAverageViews, 1, 1_000_000_000),
      minEngagementRate: optionalNumber(body.minEngagementRate, 0.01, 100),
      postedWithinDays: optionalNumber(body.postedWithinDays, 1, 3650),
      platforms: platforms.length > 0 ? platforms : undefined,
      hasEmail: !!body.hasEmail,
      minBrandSafety: optionalNumber(body.minBrandSafety, 1, 100),
      minSponsorshipFrequency: optionalNumber(body.minSponsorshipFrequency, 1, 100),
      excludeBrandChannels: !!body.excludeBrandChannels,
      categories: categories.length > 0 ? categories : undefined,
      sortOrder,
      sortBy,
      maxResults,
    });
    const unitsUsedToday = await getUnitsUsedToday();
    return NextResponse.json({ results, candidateCount, searchedPhrases, unitsUsed, unitsUsedToday });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
