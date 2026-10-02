import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Marks (or unmarks) the public roster as shared with a brand — for when it went out somewhere the
 * system can't see (WhatsApp, a call, another inbox), or was detected wrongly. Emails that contain
 * the roster link set this on their own.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { sent?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof body.sent !== "boolean") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const sequence = await prisma.outreachSequence.findUnique({ where: { id }, select: { outreachType: true, rosterSentAt: true } });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (sequence.outreachType !== "BRAND") return NextResponse.json({ error: "The roster is only shared with brands" }, { status: 400 });
  if (!!sequence.rosterSentAt === body.sent) return NextResponse.json({ ok: true });

  await prisma.$transaction([
    prisma.outreachSequence.update({ where: { id }, data: { rosterSentAt: body.sent ? new Date() : null } }),
    prisma.activityLog.create({
      data: {
        sequenceId: id,
        eventType: "STAGE_CHANGED",
        description: body.sent ? "Roster marked as shared by hand." : "Roster shared mark removed by hand.",
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
