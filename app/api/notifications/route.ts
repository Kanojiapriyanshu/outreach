import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Sequence events worth interrupting someone for. Routine bookkeeping (FOLLOW_UP_SCHEDULED,
// NO_REPLY_FOUND, REPLY_CHECK_PERFORMED, STAGE_CHANGED, etc.) stays in the full History log but
// doesn't belong in a notification feed.
const HIGH_SIGNAL_EVENTS = ["UNSUBSCRIBE_DETECTED", "BOUNCE_DETECTED"] as const;

/**
 * The notification feed, now anchored to the real inbox rather than to a parallel alert table.
 *
 * Unread means exactly what it means in Gmail: conversations in the inbox that haven't been read.
 * That's the fix for the count being "logically" wrong before — it used to track a separate
 * notion of "alerts you haven't looked at", so reading mail in Gmail left the badge stuck, and a
 * reply on a tracked thread could be double-counted as both an alert and an activity event.
 * Now there's one source of truth, it clears when mail is actually read (here or in Gmail), and
 * it's the number the inbox itself shows.
 *
 * Delivery problems (bounces, opt-outs) still come from the activity log, because those aren't
 * inbox conversations — nothing arrives to be read, but they absolutely need eyes.
 */
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;
  const validSince = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;

  const [unreadThreads, unreadCount, alerts, alertCount] = await Promise.all([
    prisma.inboxThread.findMany({
      where: { isUnread: true, isArchived: false, isTrashed: false },
      orderBy: { lastMessageAt: "desc" },
      take: 15,
      select: {
        id: true,
        subject: true,
        snippet: true,
        fromName: true,
        fromAddress: true,
        lastMessageAt: true,
        sequenceId: true,
      },
    }),
    prisma.inboxThread.count({ where: { isUnread: true, isArchived: false, isTrashed: false } }),
    prisma.activityLog.findMany({
      where: {
        eventType: { in: [...HIGH_SIGNAL_EVENTS] },
        sequence: { deletedAt: null },
        ...(validSince ? { timestamp: { gt: validSince } } : {}),
      },
      orderBy: { timestamp: "desc" },
      take: 10,
      include: {
        sequence: {
          select: { id: true, contact: { select: { name: true, email: true } } },
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

  return NextResponse.json({
    unreadThreads,
    alerts,
    // One number, matching what the inbox shows — unread conversations plus anything that went
    // wrong and can't be "read" away.
    unreadCount: unreadCount + alertCount,
  });
}
