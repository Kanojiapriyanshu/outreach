import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The events actually worth interrupting someone for — a reply landed, someone opted out, or a
// message bounced. Routine bookkeeping (FOLLOW_UP_SCHEDULED, NO_REPLY_FOUND, REPLY_CHECK_PERFORMED,
// STAGE_CHANGED, etc.) stays in the full History log but doesn't belong in a notification feed —
// this is specifically "don't let me miss an email that matters," not a duplicate of /activity.
const HIGH_SIGNAL_EVENTS = ["REPLY_DETECTED", "GENERIC_REPLY_DETECTED", "UNSUBSCRIBE_DETECTED", "BOUNCE_DETECTED"] as const;

export async function GET() {
  const logs = await prisma.activityLog.findMany({
    where: {
      eventType: { in: [...HIGH_SIGNAL_EVENTS] },
      sequence: { deletedAt: null },
    },
    orderBy: { timestamp: "desc" },
    take: 30,
    include: {
      sequence: {
        select: {
          id: true,
          outreachType: true,
          stage: true,
          contact: { select: { name: true, email: true, brand: { select: { name: true } }, creator: { select: { name: true } } } },
        },
      },
    },
  });

  return NextResponse.json({ notifications: logs });
}
