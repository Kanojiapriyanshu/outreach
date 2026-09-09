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
 * Permanently deletes a tracked sequence and everything under it (messages, scheduled
 * follow-ups, activity log) — nothing in Gmail itself is touched. The main reason to reach for
 * this: re-attaching the same Gmail thread while an old (stopped/paused) sequence for it still
 * exists just returns that old one as a duplicate instead of starting fresh — deleting it first
 * clears the way. Leaves the Contact/Brand/Creator rows behind rather than cascading further;
 * they're harmless once nothing points at them, and safer than guessing whether something else
 * might still reference them.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.activityLog.deleteMany({ where: { sequenceId: id } }),
    prisma.scheduledAction.deleteMany({ where: { sequenceId: id } }),
    prisma.emailMessage.deleteMany({ where: { sequenceId: id } }),
    prisma.outreachSequence.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
