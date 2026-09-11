import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * The reports list.
 *
 * Reads only the lifted columns, never the JSON document — that's the whole reason those columns
 * exist. Loading every full report to draw a table would get slower with each one generated.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 25));
  const q = params.get("search")?.trim() ?? "";

  // The UI sends an explicit range rather than a day count, so honour both — and ignore a date
  // that doesn't parse instead of turning it into an Invalid Date that matches nothing.
  const parseDate = (value: string | null): Date | undefined => {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const from = parseDate(params.get("fromDate"));
  const to = parseDate(params.get("toDate"));

  const where = {
    ...(q
      ? {
          OR: [
            { videoTitle: { contains: q, mode: "insensitive" as const } },
            { channelTitle: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.insightReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        videoId: true,
        videoUrl: true,
        videoTitle: true,
        channelId: true,
        channelTitle: true,
        thumbnailUrl: true,
        viewCount: true,
        engagementRate: true,
        finalScore: true,
        verdict: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
    prisma.insightReport.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    // The list UI came from an app whose documents used different names for these same values.
    // Aliasing here keeps that mapping in one place, rather than teaching a 1,700-line component
    // a second set of field names it would then have to keep in sync.
    data: rows.map((r) => ({
      ...r,
      reportId: r.id,
      influencerName: r.channelTitle,
      platform: "youtube",
      finalAiScore: r.finalScore,
      views: r.viewCount,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
