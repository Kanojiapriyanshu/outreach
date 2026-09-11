import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInsightReport } from "@/lib/youtube/insightReport";
import { formatYoutubeInsightReport } from "@/lib/youtube/reportDashboard";

export const maxDuration = 60;

/**
 * Re-analyses the same video against current YouTube data.
 *
 * This replaces the existing row rather than creating a second one, so "refresh" means the report
 * you're looking at gets newer numbers — not that the list fills with near-duplicate entries of
 * the same video every time someone checks on it.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const existing = await prisma.insightReport.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });

  try {
    const fresh = await createInsightReport({
      actor: {},
      payload: { videoUrl: existing.videoUrl, saveReport: false },
    });

    const updated = await prisma.insightReport.update({
      where: { id },
      data: {
        videoTitle: fresh.videoMetrics?.title ?? existing.videoTitle,
        thumbnailUrl: fresh.videoMetrics?.thumbnailUrl ?? existing.thumbnailUrl,
        viewCount: Math.round(Number(fresh.videoMetrics?.viewCount ?? existing.viewCount)),
        engagementRate: Number(fresh.videoMetrics?.engagementRate ?? existing.engagementRate),
        finalScore: Number(fresh.aiScores?.finalAiScore ?? existing.finalScore),
        verdict: fresh.finalVerdict?.verdict ?? existing.verdict,
        data: fresh as any,
      },
    });

    const report: any = {
      ...(updated.data as object),
      reportId: updated.id,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      chartData: fresh.chartData,
      dashboard: fresh.dashboard,
    };

    return NextResponse.json({ success: true, data: formatYoutubeInsightReport(report, {}) });
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Couldn't refresh that report." },
      { status }
    );
  }
}
