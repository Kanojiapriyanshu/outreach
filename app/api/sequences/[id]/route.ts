import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sequence = await prisma.outreachSequence.findUnique({
    where: { id },
    include: {
      contact: { include: { brand: true, creator: true } },
      emailAccount: true,
      scheduledActions: { orderBy: { step: "asc" } },
      messages: { orderBy: { sentAt: "asc" } },
      activityLogs: { orderBy: { timestamp: "asc" } },
    },
  });

  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ sequence });
}

/**
 * Moves a tracked sequence to Trash (soft delete) — like Gmail, deleting doesn't destroy
 * anything right away. The worker stops touching it immediately (see deletedAt checks in
 * lib/scheduler.ts) but the row and its full history stay until either restored or permanently
 * deleted from the Trash view. Nothing in Gmail itself is ever touched by this — see
 * app/(app)/trash/page.tsx for why "delete from Gmail too" isn't something this button does.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sequence.deletedAt) return NextResponse.json({ ok: true }); // already in Trash

  await prisma.$transaction([
    prisma.outreachSequence.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.activityLog.create({
      data: { sequenceId: id, eventType: "MOVED_TO_TRASH", description: "Moved to Trash." },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
