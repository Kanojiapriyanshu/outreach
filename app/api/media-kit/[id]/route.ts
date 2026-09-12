import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Internal fetch for the logged-in preview page. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mediaKit = await prisma.channelMediaKit.findUnique({ where: { id } });
  if (!mediaKit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ mediaKit });
}
