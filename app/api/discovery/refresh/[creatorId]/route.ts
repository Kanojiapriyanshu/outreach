import { NextRequest, NextResponse } from "next/server";
import { refreshCreator } from "@/lib/youtube/discoveryEngine";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  const { creatorId } = await params;
  const result = await refreshCreator(creatorId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
