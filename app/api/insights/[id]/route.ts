import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatYoutubeInsightReport, buildChartData, buildYoutubeInsightDashboard } from "@/lib/youtube/reportDashboard";

/** Opens one stored report. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.insightReport.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });

  // chartData and dashboard are presentation layers over the stored document, rebuilt on read
  // rather than persisted — that way a change to how reports are displayed applies to old reports
  // too, instead of only to ones generated afterwards.
  const report: any = {
    ...(row.data as object),
    reportId: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  report.chartData = buildChartData(report);
  report.dashboard = buildYoutubeInsightDashboard(report);

  return NextResponse.json({ success: true, data: formatYoutubeInsightReport(report, {}) });
}

/** Permanently removes a report and any share links pointing at it (cascade). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deleted = await prisma.insightReport.deleteMany({ where: { id } });
  if (deleted.count === 0) {
    return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
