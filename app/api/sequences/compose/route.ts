import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { composeAndSendInitialEmail, scheduleInitialEmail, type ComposeEmailInput } from "@/lib/trackSequence";
import { syncInbox } from "@/lib/inboxSync";

export async function POST(req: NextRequest) {
  const { scheduledAt: scheduledAtRaw, ...body }: ComposeEmailInput & { scheduledAt?: string } = await req.json();

  // The guided New Outreach form always resolves and passes an account explicitly (it supports
  // choosing between several). The inbox Compose window doesn't have that picker, so it relies on
  // the same "just use the connected one" default /api/inbox/send already uses for a plain send.
  if (!body.emailAccountId) {
    const account = await prisma.emailAccount.findFirst({ where: { accessStatus: "CONNECTED" } });
    if (account) body.emailAccountId = account.id;
  }

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

  // Guided New Outreach navigates straight to the dashboard, where this never mattered. Composed
  // from the inbox, though, the team lands back in the thread list right after sending — pull the
  // new conversation into the mirror now instead of leaving it to show up whenever the next
  // periodic sync happens to run, same reasoning as the plain-send route.
  syncInbox().catch(() => {});

  const sequence = await prisma.outreachSequence.findUnique({ where: { id: result.sequenceId } });
  return NextResponse.json({ sequence });
}
