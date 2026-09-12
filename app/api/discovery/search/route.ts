import { NextRequest, NextResponse } from "next/server";
import { runDiscoverySearch, getUnitsUsedToday } from "@/lib/youtube/discoveryEngine";

interface SearchBody {
  query?: string;
  country?: string;
  minSubscribers?: number;
  maxSubscribers?: number;
  postedWithinDays?: number;
  maxResults?: number;
}

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

  try {
    const { results, candidateCount, unitsUsed } = await runDiscoverySearch({
      query,
      country: body.country?.trim() || undefined,
      minSubscribers: body.minSubscribers ? Number(body.minSubscribers) : undefined,
      maxSubscribers: body.maxSubscribers ? Number(body.maxSubscribers) : undefined,
      postedWithinDays: body.postedWithinDays ? Number(body.postedWithinDays) : undefined,
      maxResults,
    });
    const unitsUsedToday = await getUnitsUsedToday();
    return NextResponse.json({ results, candidateCount, unitsUsed, unitsUsedToday });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
