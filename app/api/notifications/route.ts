import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The events actually worth interrupting someone for — a reply landed, someone opted out, or a
// message bounced. Routine bookkeeping (FOLLOW_UP_SCHEDULED, NO_REPLY_FOUND, REPLY_CHECK_PERFORMED,
// STAGE_CHANGED, etc.) stays in the full History log but doesn't belong in a notification feed —
// this is specifically "don't let me miss an email that matters," not a duplicate of /activity.
const HIGH_SIGNAL_EVENTS = ["REPLY_DETECTED", "GENERIC_REPLY_DETECTED", "UNSUBSCRIBE_DETECTED", "BOUNCE_DETECTED"] as const;

/** `?since=<ISO timestamp>` — when passed (the client's own last-seen marker), also returns the
 * *exact* unread count via a separate COUNT query, independent of the 30-row display cap below.
 * Without this, a genuinely-Gmail-like badge ("47 unread") would silently be wrong — capped at
 * whatever the display list happened to fetch — once a batch of replies pushed past 30. */
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;
  const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;

  const [logs, unreadCount] = await Promise.all([
    prisma.activityLog.findMany({
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
    }),
    validSince
      ? prisma.activityLog.count({
          where: {
            eventType: { in: [...HIGH_SIGNAL_EVENTS] },
            sequence: { deletedAt: null },
            timestamp: { gt: validSince },
          },
        })
      : Promise.resolve(0),
  ]);

  return NextResponse.json({ notifications: logs, unreadCount });
}
