import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** The no-login lookup a brand's browser hits directly — public per middleware.ts's PUBLIC_PATHS,
 * the unguessable token is the only access control (see the share route). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await prisma.channelMediaKitShare.findUnique({
    where: { token },
    // Only `data` (the full JSON payload the view actually renders) — the lifted columns
    // duplicate a subset of it for querying/filtering and aren't needed here. Selecting them
    // would also break plain JSON.stringify: totalViewCount is a BigInt column (a big channel's
    // lifetime views can exceed Postgres INTEGER), which NextResponse.json can't serialize as-is.
    select: { revokedAt: true, mediaKit: { select: { data: true } } },
  });
  if (!share || share.revokedAt) return NextResponse.json({ error: "This link is no longer available." }, { status: 404 });
  return NextResponse.json({ mediaKit: share.mediaKit });
}
