import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/** Creates (or returns) a no-login link to one channel media kit — mirrors
 * /api/insights/[id]/share/route.ts exactly; see that route's comment for why the token, not the
 * id, is the access control, and why re-requesting reuses the existing live link. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const mediaKit = await prisma.channelMediaKit.findUnique({ where: { id } });
  if (!mediaKit) return NextResponse.json({ error: "Media kit not found" }, { status: 404 });

  const existing = await prisma.channelMediaKitShare.findFirst({
    where: { mediaKitId: id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const share =
    existing ??
    (await prisma.channelMediaKitShare.create({
      data: { mediaKitId: id, token: randomBytes(32).toString("base64url") },
    }));

  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
  return NextResponse.json({ success: true, url: `${base}/media-kit/shared/${share.token}` });
}

/** Withdraws the link without deleting the media kit. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.channelMediaKitShare.updateMany({ where: { mediaKitId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ success: true });
}
