import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatYoutubeInsightReport, buildChartData, buildYoutubeInsightDashboard } from "@/lib/youtube/reportDashboard";

/**
 * Reads a shared report by token. No session required — this is the link sent to a brand.
 *
 * Deliberately returns the same 404 for an unknown token, a revoked one, and a report that's since
 * been deleted: distinguishing them would confirm to someone probing tokens that a given one had
 * once been real.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const share = await prisma.insightReportShare.findUnique({
    where: { token },
    include: { report: true },
  });

  if (!share || share.revokedAt || !share.report) {
    return NextResponse.json({ success: false, message: "This link is no longer available." }, { status: 404 });
  }

  const report: any = {
    ...(share.report.data as object),
    reportId: share.report.id,
    createdAt: share.report.createdAt,
    updatedAt: share.report.updatedAt,
  };
  report.chartData = buildChartData(report);
  report.dashboard = buildYoutubeInsightDashboard(report);

  return NextResponse.json({ success: true, data: formatYoutubeInsightReport(report, {}) });
}
