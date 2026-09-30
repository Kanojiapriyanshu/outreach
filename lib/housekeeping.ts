/**
 * Nightly storage housekeeping. The database is on Neon's free plan (0.5 GB), and three things
 * grow without adding anything anyone reads:
 *
 * - routine history lines written around every follow-up ("Checked the inbox for a reply.",
 *   "No reply yet.") — the events that matter (replies, rates, stage changes, sends) are kept;
 * - full copies of media kits that nothing points at any more — every regeneration saves a new one;
 * - email bodies cached in the inbox mirror for old threads — Gmail still has them, and opening the
 *   thread downloads them again (lib/inboxSync.ts loadThreadWithBodies).
 *
 * Nothing about brands, creators, rates, threads, pitch sheets or contracts is touched. Runs from
 * the worker tick during the 03:00 IST hour; every step is idempotent, so a second run that night
 * finds nothing left to do.
 */
import { prisma } from "@/lib/prisma";
import { businessHour } from "@/lib/formatDate";

const HOUSEKEEPING_HOUR_IST = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const ROUTINE_HISTORY_KEEP_DAYS = 14;
const MEDIA_KIT_KEEP_DAYS = 30;
const CACHED_BODY_KEEP_DAYS = 60;

// Exactly the words the scheduler writes for its routine checks — never a free-form entry.
const ROUTINE_HISTORY = [
  { eventType: "REPLY_CHECK_PERFORMED" as const, description: "Checked the inbox for a reply." },
  { eventType: "NO_REPLY_FOUND" as const, description: "No reply yet." },
];

export async function runNightlyHousekeeping(now: Date = new Date()) {
  if (businessHour(now) !== HOUSEKEEPING_HOUR_IST) return null;
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);

  const history = await prisma.activityLog.deleteMany({
    where: { OR: ROUTINE_HISTORY, timestamp: { lt: before(ROUTINE_HISTORY_KEEP_DAYS) } },
  });

  // A media kit is kept while anything can still reach it: a creator's current kit, one behind a
  // share link that still works (a brand may have it), or the newest kit for its channel (what
  // Discovery opens). Older copies nobody can reach are removed.
  const [current, newestPerChannel] = await Promise.all([
    prisma.creator.findMany({ where: { mediaKitId: { not: null } }, select: { mediaKitId: true } }),
    prisma.channelMediaKit.findMany({ distinct: ["channelId"], orderBy: [{ channelId: "asc" }, { createdAt: "desc" }], select: { id: true } }),
  ]);
  const keep = [...current.map((c) => c.mediaKitId!), ...newestPerChannel.map((k) => k.id)];
  const kits = await prisma.channelMediaKit.deleteMany({
    where: { id: { notIn: keep }, createdAt: { lt: before(MEDIA_KIT_KEEP_DAYS) }, shares: { none: { revokedAt: null } } },
  });

  const bodies = await prisma.inboxMessage.updateMany({
    where: { sentAt: { lt: before(CACHED_BODY_KEEP_DAYS) }, OR: [{ bodyText: { not: null } }, { bodyHtml: { not: null } }] },
    data: { bodyText: null, bodyHtml: null },
  });
  await prisma.inboxThread.updateMany({
    where: { lastMessageAt: { lt: before(CACHED_BODY_KEEP_DAYS) }, bodiesFetchedAt: { not: null } },
    data: { bodiesFetchedAt: null },
  });

  const result = { historyRemoved: history.count, mediaKitsRemoved: kits.count, bodiesCleared: bodies.count };
  if (result.historyRemoved || result.mediaKitsRemoved || result.bodiesCleared) console.log("[housekeeping]", result);
  return result;
}
