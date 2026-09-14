import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Clears the "needs your reply" highlight when a reply was dealt with somewhere the system can't
 * see — a call, a DM, a message from a different inbox. Replying in the thread clears it on its own.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sequence = await prisma.outreachSequence.findUnique({
    where: { id },
    select: { id: true, awaitingResponseSince: true },
  });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (!sequence.awaitingResponseSince) return NextResponse.json({ ok: true });

  await prisma.$transaction([
    prisma.outreachSequence.update({ where: { id }, data: { awaitingResponseSince: null } }),
    prisma.activityLog.create({
      data: { sequenceId: id, eventType: "REPLY_HANDLED", description: "Marked their reply as handled." },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
