import { NextRequest, NextResponse } from "next/server";
import { runDiscoverySearch, getUnitsUsedToday, PLATFORM_KEYS, type PlatformKey } from "@/lib/youtube/discoveryEngine";

interface SearchBody {
  query?: string;
  country?: string;
  language?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  minAverageViews?: number;
  maxAverageViews?: number;
  minEngagementRate?: number;
  postedWithinDays?: number;
  platforms?: string[];
  sortOrder?: "relevance" | "viewCount" | "date";
  maxResults?: number;
}

const VALID_PLATFORMS = new Set<string>(PLATFORM_KEYS);
const VALID_SORT_ORDERS = new Set(["relevance", "viewCount", "date"]);

/**
 * Runs a live Discovery search and returns fresh results. Every result is also upserted into the
 * Creator table by channelId inside runDiscoverySearch — the Library is warmed by this route
 * automatically, not by a separate "save" step.
 */
export async function POST(req: NextRequest) {
  const body: SearchBody = await req.json();
  const query = body.query?.trim() ?? "";
  if (!query) return NextResponse.json({ error: "Enter a niche or keyword to search for" }, { status: 400 });

  const maxResults = Math.min(Math.max(Number(body.maxResults) || 20, 5), 50);
  const platforms = (body.platforms ?? []).filter((p): p is PlatformKey => VALID_PLATFORMS.has(p));
  const sortOrder = VALID_SORT_ORDERS.has(body.sortOrder ?? "") ? body.sortOrder : undefined;

  try {
    const { results, candidateCount, unitsUsed } = await runDiscoverySearch({
      query,
      country: body.country?.trim() || undefined,
      language: body.language?.trim() || undefined,
      minSubscribers: body.minSubscribers ? Number(body.minSubscribers) : undefined,
      maxSubscribers: body.maxSubscribers ? Number(body.maxSubscribers) : undefined,
      minAverageViews: body.minAverageViews ? Number(body.minAverageViews) : undefined,
      maxAverageViews: body.maxAverageViews ? Number(body.maxAverageViews) : undefined,
      minEngagementRate: body.minEngagementRate ? Number(body.minEngagementRate) : undefined,
      postedWithinDays: body.postedWithinDays ? Number(body.postedWithinDays) : undefined,
      platforms: platforms.length > 0 ? platforms : undefined,
      sortOrder,
      maxResults,
    });
    const unitsUsedToday = await getUnitsUsedToday();
    return NextResponse.json({ results, candidateCount, unitsUsed, unitsUsedToday });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
