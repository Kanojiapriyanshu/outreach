import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, reason }: { email: string; reason?: string } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const suppressed = await prisma.suppressedContact.upsert({
    where: { email: email.toLowerCase() },
    update: { reason },
    create: { email: email.toLowerCase(), reason },
  });

  // Stop any active sequences for this contact (PRD §33).
  const sequences = await prisma.outreachSequence.findMany({
    where: { contact: { email: email.toLowerCase() } },
  });
  for (const seq of sequences) {
    if (!["REPLIED", "BOUNCED", "STOPPED", "COMPLETED", "UNSUBSCRIBED"].includes(seq.status)) {
      await prisma.$transaction([
        prisma.outreachSequence.update({ where: { id: seq.id }, data: { status: "UNSUBSCRIBED" } }),
        prisma.scheduledAction.updateMany({
          where: { sequenceId: seq.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "UNSUBSCRIBE_DETECTED",
            description: "Added to the Do Not Email list — follow-ups stopped.",
          },
        }),
      ]);
    }
  }

  return NextResponse.json({ suppressed });
}

export async function DELETE(req: NextRequest) {
  const { email }: { email: string } = await req.json();
  await prisma.suppressedContact.delete({ where: { email: email.toLowerCase() } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
