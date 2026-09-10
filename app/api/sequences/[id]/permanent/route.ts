import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * The actual, irreversible delete — only reachable from the Trash view, and only for something
 * already sitting there. Removes the sequence and everything under it (messages, scheduled
 * follow-ups, activity log) from the CRM's own database. Deliberately does NOT touch the real
 * Gmail thread: doing that would need a broader Gmail permission than this app currently asks
 * for (gmail.send + gmail.readonly only — trashing/deleting a message needs gmail.modify or
 * full mail.google.com access), which means re-authenticating every connected account, and
 * permanently destroying a real email is a much bigger, harder-to-undo action than clearing a
 * row out of this CRM. Leaves the Contact/Brand/Creator rows behind rather than cascading
 * further — harmless once nothing points at them.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sequence.deletedAt) {
    return NextResponse.json({ error: "Move it to Trash first before deleting it for good" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.activityLog.deleteMany({ where: { sequenceId: id } }),
    prisma.scheduledAction.deleteMany({ where: { sequenceId: id } }),
    prisma.emailMessage.deleteMany({ where: { sequenceId: id } }),
    prisma.outreachSequence.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
