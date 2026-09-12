import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Internal fetch for the logged-in preview page. Only `data` — see the public route's identical
 * comment on why the lifted BigInt column can't go through plain JSON.stringify. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mediaKit = await prisma.channelMediaKit.findUnique({ where: { id }, select: { data: true } });
  if (!mediaKit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ mediaKit });
}
