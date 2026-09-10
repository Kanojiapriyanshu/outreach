import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Pulls a sequence back out of Trash — the worker resumes touching it on the next tick, exactly
 * as if it had never been deleted (nothing about its state/history was ever changed while it sat
 * in Trash). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sequence.deletedAt) return NextResponse.json({ ok: true }); // wasn't in Trash

  await prisma.$transaction([
    prisma.outreachSequence.update({ where: { id }, data: { deletedAt: null } }),
    prisma.activityLog.create({
      data: { sequenceId: id, eventType: "RESTORED_FROM_TRASH", description: "Restored from Trash." },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
