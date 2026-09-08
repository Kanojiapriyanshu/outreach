import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Manual backstop for the creator-list "Response Received" indicator — the automatic reply
 * classifier already sets this on a detected reply, but the team can flip it by hand either way
 * (e.g. a reply the classifier missed, or undoing an accidental mark).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { received }: { received: boolean } = await req.json();

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.outreachSequence.update({
      where: { id },
      data: { creatorListResponseAt: received ? new Date() : null },
    }),
    prisma.activityLog.create({
      data: {
        sequenceId: id,
        eventType: "STAGE_CHANGED",
        description: received
          ? "Marked as responded (creator list) by hand."
          : "Unmarked as responded (creator list) by hand.",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
