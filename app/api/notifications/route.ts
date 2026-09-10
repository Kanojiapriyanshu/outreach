import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The events actually worth interrupting someone for — a reply landed, someone opted out, or a
// message bounced. Routine bookkeeping (FOLLOW_UP_SCHEDULED, NO_REPLY_FOUND, REPLY_CHECK_PERFORMED,
// STAGE_CHANGED, etc.) stays in the full History log but doesn't belong in a notification feed —
// this is specifically "don't let me miss an email that matters," not a duplicate of /activity.
const HIGH_SIGNAL_EVENTS = ["REPLY_DETECTED", "GENERIC_REPLY_DETECTED", "UNSUBSCRIBE_DETECTED", "BOUNCE_DETECTED"] as const;

/** `?since=<ISO timestamp>` — when passed (the client's own last-seen marker), also returns the
 * *exact* unread count via separate COUNT queries, independent of the 30-row display caps below.
 * Without this, a genuinely-Gmail-like badge ("47 unread") would silently be wrong — capped at
 * whatever the display lists happened to fetch — once a batch of replies (or new inbox mail)
 * pushed past the cap.
 *
 * Two kinds of thing show up here: high-signal ActivityLog events on threads the CRM is already
 * tracking (replies, bounces, opt-outs), and InboxAlert rows — mail the inbox-watch pass found
 * that *isn't* part of any tracked thread at all (see lib/inboxWatch.ts). Both matter for "don't
 * let me miss an email," so both count toward the same badge and share the same dropdown.
 */
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;
  const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;

  const [logs, inboxAlerts, unreadLogCount, unreadInboxCount] = await Promise.all([
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
    prisma.inboxAlert.findMany({
      where: { dismissedAt: null },
      orderBy: { receivedAt: "desc" },
      take: 30,
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
    validSince
      ? prisma.inboxAlert.count({ where: { dismissedAt: null, receivedAt: { gt: validSince } } })
      : prisma.inboxAlert.count({ where: { dismissedAt: null } }),
  ]);

  return NextResponse.json({
    notifications: logs,
    inboxAlerts,
    unreadCount: unreadLogCount + unreadInboxCount,
  });
}
