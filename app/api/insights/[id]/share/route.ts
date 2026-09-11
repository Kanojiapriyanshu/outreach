import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Creates (or returns) a no-login link to one report, for sending to a brand.
 *
 * The token is the only access control, so it's 32 bytes of real randomness rather than the
 * report's own id — an id is guessable by anyone who has seen one, and these reports are client
 * work. Re-requesting returns the existing live link instead of minting a second one, so a link
 * already sent out doesn't quietly stop being the canonical one.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const report = await prisma.insightReport.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });

  const existing = await prisma.insightReportShare.findFirst({
    where: { reportId: id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const share =
    existing ??
    (await prisma.insightReportShare.create({
      data: { reportId: id, token: randomBytes(32).toString("base64url") },
    }));

  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
  return NextResponse.json({
    success: true,
    data: { token: share.token, url: `${base}/insights/shared/${share.token}` },
  });
}

/** Withdraws the link without deleting the report. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.insightReportShare.updateMany({
    where: { reportId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
