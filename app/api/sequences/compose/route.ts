import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { composeAndSendInitialEmail, scheduleInitialEmail, type ComposeEmailInput } from "@/lib/trackSequence";

export async function POST(req: NextRequest) {
  const { scheduledAt: scheduledAtRaw, ...body }: ComposeEmailInput & { scheduledAt?: string } = await req.json();

  if (!body.outreachType || !body.emailAccountId || !body.contactEmail || !body.contactName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // A future send time behaves exactly like Gmail's "Schedule send" — everything else about this
  // route (immediate send when no time is given, or one already in the past) is unchanged.
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now() + 60_000) {
    const result = await scheduleInitialEmail(body, scheduledAt);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ scheduled: true, scheduledAt: result.scheduledAt });
  }

  const result = await composeAndSendInitialEmail(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const sequence = await prisma.outreachSequence.findUnique({ where: { id: result.sequenceId } });
  return NextResponse.json({ sequence });
}
