import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateChannelMediaKit } from "@/lib/youtube/channelMediaKit";

export const maxDuration = 60;

interface GenerateBody {
  creatorId?: string;
  channelId?: string;
}

/** Generates a fresh whole-channel media kit — either for a Discovery Creator (looked up by id,
 * which also carries the niche it was discovered under) or directly by channelId. */
export async function POST(req: NextRequest) {
  const body: GenerateBody = await req.json().catch(() => ({}));

  let channelId = body.channelId?.trim();
  let niche: string | undefined;

  if (!channelId && body.creatorId) {
    const creator = await prisma.creator.findUnique({ where: { id: body.creatorId } });
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    if (!creator.channelId) return NextResponse.json({ error: "This creator has no YouTube channel on file" }, { status: 400 });
    channelId = creator.channelId;
    niche = creator.niche ?? undefined;
  }

  if (!channelId) return NextResponse.json({ error: "Missing channelId or creatorId" }, { status: 400 });

  try {
    const { mediaKitId, data } = await generateChannelMediaKit(channelId, niche);
    return NextResponse.json({ success: true, mediaKitId, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't generate the media kit";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
