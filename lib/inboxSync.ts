import { prisma } from "@/lib/prisma";
import {
  gmailClientFor,
  getThreadForInbox,
  listThreadIds,
  listChangedThreadIds,
  getCurrentHistoryId,
  parseFromHeader,
  type SyncedThread,
} from "@/lib/gmail";
import { isTrackingNotification } from "@/lib/trackingSenders";

/**
 * Threads pulled per run. The incremental path normally returns a handful of changed threads, so
 * this cap only really bites on the very first sync of an existing mailbox — which it deliberately
 * spreads across several runs (a couple of minutes apart) instead of trying to swallow a whole
 * mailbox inside one serverless invocation.
 */
const MAX_THREADS_PER_SYNC = 15;
/** How many thread fetches are in flight at once. Enough to hide network latency, low enough to
 * stay well under Gmail's per-user rate limit. */
const FETCH_CONCURRENCY = 5;
/** How far back the initial backfill reaches. Everything older stays in Gmail and is reachable by
 * searching; mirroring an entire mailbox history would cost a lot and buy very little. */
const BACKFILL_THREADS = 60;

function labelState(labelIds: string[]) {
  return {
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    isArchived: !labelIds.includes("INBOX"),
    isTrashed: labelIds.includes("TRASH"),
    isSent: labelIds.includes("SENT"),
  };
}

/**
 * Writes one Gmail conversation into the local mirror. Metadata-only syncs deliberately don't
 * clobber cached bodies — bodiesFetchedAt tracks that separately, so a thread that's been opened
 * and cached keeps its bodies through later metadata refreshes.
 */
async function upsertThread(
  emailAccountId: string,
  accountEmail: string,
  thread: SyncedThread,
  { withBodies }: { withBodies: boolean }
) {
  if (thread.messages.length === 0) return null;

  const state = labelState(thread.labelIds);
  const sorted = [...thread.messages]
    .filter((m) => !isTrackingNotification(parseFromHeader(m.from).address))
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  // Nothing but tracking notifications — there's no conversation here to mirror. Remove any
  // version of it already stored, so turning this filter on cleans up what it previously let in.
  if (sorted.length === 0) {
    await prisma.inboxThread.deleteMany({
      where: { emailAccountId, gmailThreadId: thread.gmailThreadId },
    });
    return null;
  }

  const latest = sorted[sorted.length - 1];

  // The conversation is *with* the other party — show them in the list, not ourselves, even when
  // the most recent message in the thread is one we sent.
  const counterpart =
    [...sorted].reverse().find((m) => !m.from.toLowerCase().includes(accountEmail.toLowerCase())) ?? latest;
  const { name: fromName, address: fromAddress } = parseFromHeader(counterpart.from);

  // Link the thread to an outreach sequence when the CRM is already running one on it — this is
  // what lets the inbox show pipeline context and reason about follow-ups on reply.
  const sequence = await prisma.outreachSequence.findFirst({
    where: { threadId: thread.gmailThreadId },
    select: { id: true },
  });

  const common = {
    subject: sorted[0].subject || "(no subject)",
    snippet: latest.snippet,
    fromName,
    fromAddress,
    lastMessageAt: latest.sentAt,
    messageCount: sorted.length,
    ...state,
    sequenceId: sequence?.id ?? null,
    ...(withBodies ? { bodiesFetchedAt: new Date() } : {}),
  };

  const row = await prisma.inboxThread.upsert({
    where: { emailAccountId_gmailThreadId: { emailAccountId, gmailThreadId: thread.gmailThreadId } },
    create: { emailAccountId, gmailThreadId: thread.gmailThreadId, ...common },
    update: common,
  });

  // Clear out tracking notifications stored before this filter existed, so a re-sync repairs
  // existing threads rather than only keeping new ones clean.
  await prisma.inboxMessage.deleteMany({
    where: {
      threadId: row.id,
      gmailMessageId: { notIn: sorted.map((m) => m.gmailMessageId) },
    },
  });

  for (const m of sorted) {
    const { name, address } = parseFromHeader(m.from);
    const isOutbound = address.toLowerCase() === accountEmail.toLowerCase();
    const base = {
      fromName: name,
      fromAddress: address,
      toAddresses: m.to,
      ccAddresses: m.cc,
      subject: m.subject,
      snippet: m.snippet,
      direction: (isOutbound ? "OUT" : "IN") as "OUT" | "IN",
      sentAt: m.sentAt,
    };
    await prisma.inboxMessage.upsert({
      where: { threadId_gmailMessageId: { threadId: row.id, gmailMessageId: m.gmailMessageId } },
      create: {
        threadId: row.id,
        gmailMessageId: m.gmailMessageId,
        ...base,
        bodyText: withBodies ? m.bodyText : null,
        bodyHtml: withBodies ? m.bodyHtml : null,
      },
      // Only overwrite bodies when this fetch actually carried them, so a metadata refresh can't
      // blank out a thread that was already opened and cached.
      update: withBodies ? { ...base, bodyText: m.bodyText, bodyHtml: m.bodyHtml } : base,
    });
  }

  return row;
}

/**
 * Brings the local mirror up to date with Gmail for every connected account.
 *
 * Two paths: an incremental one driven by Gmail's history cursor (asks only "what changed since
 * last time", so cost tracks activity rather than mailbox size) and a bounded full list used for
 * the first sync or when Gmail expires the cursor — which it does after about a week idle.
 */
export async function syncInbox() {
  const accounts = await prisma.emailAccount.findMany({ where: { accessStatus: "CONNECTED" } });
  let threadsSynced = 0;

  for (const account of accounts) {
    try {
      const gmail = await gmailClientFor(account.id);
      let threadIds: string[] = [];
      let nextHistoryId: string | null = null;

      // Tracked threads already in the mirror — so the "always include tracked" pass below only
      // pulls the ones genuinely missing rather than re-fetching all of them every single sync.
      const mirroredTrackedIds = new Set(
        (
          await prisma.inboxThread.findMany({
            where: { emailAccountId: account.id, sequenceId: { not: null } },
            select: { gmailThreadId: true },
          })
        ).map((t) => t.gmailThreadId)
      );

      if (account.lastHistoryId) {
        const changed = await listChangedThreadIds(gmail, account.lastHistoryId);
        if (changed) {
          threadIds = changed.threadIds;
          nextHistoryId = changed.newHistoryId;
        }
      }

      // No cursor, or Gmail rejected it as too old — fall back to a bounded recent-threads list.
      if (!account.lastHistoryId || threadIds.length === 0) {
        const needsBackfill = !account.lastHistoryId;
        if (needsBackfill) {
          const [inbox, sent] = await Promise.all([
            listThreadIds(gmail, "in:inbox", BACKFILL_THREADS),
            listThreadIds(gmail, "in:sent", Math.floor(BACKFILL_THREADS / 2)),
          ]);
          threadIds = [...new Set([...inbox, ...sent])];
        }
        nextHistoryId = nextHistoryId ?? (await getCurrentHistoryId(gmail));
      }

      // Conversations the CRM is running a sequence on are the most important ones in the system,
      // so they're mirrored regardless of how recent they are — a recency-based backfill alone
      // would miss any sequence whose thread has scrolled out of the recent window, which is
      // exactly the case for most of them once outreach has been running a while.
      const trackedThreadIds = (
        await prisma.outreachSequence.findMany({
          where: { emailAccountId: account.id, deletedAt: null },
          select: { threadId: true },
        })
      ).map((s) => s.threadId);
      const missingTracked = trackedThreadIds.length
        ? trackedThreadIds.filter(
            (gmailThreadId) =>
              !threadIds.includes(gmailThreadId) &&
              !mirroredTrackedIds.has(gmailThreadId)
          )
        : [];
      threadIds = [...new Set([...missingTracked, ...threadIds])];

      // Skip threads already mirrored at this point in the backfill so each run makes progress
      // through the mailbox instead of re-fetching the same first N threads every time.
      if (threadIds.length > MAX_THREADS_PER_SYNC) {
        const known = new Set(
          (
            await prisma.inboxThread.findMany({
              where: { emailAccountId: account.id, gmailThreadId: { in: threadIds } },
              select: { gmailThreadId: true },
            })
          ).map((t) => t.gmailThreadId)
        );
        const unseen = threadIds.filter((id) => !known.has(id));
        threadIds = (unseen.length > 0 ? unseen : threadIds).slice(0, MAX_THREADS_PER_SYNC);
      }

      // Fetched a few at a time rather than one after another. Each call is almost entirely
      // network wait, so serial fetching made a 15-thread batch take ~40s — uncomfortably close
      // to the serverless function ceiling. Small batches keep it well clear without hammering
      // Gmail hard enough to get rate-limited.
      for (let i = 0; i < threadIds.length; i += FETCH_CONCURRENCY) {
        const batch = threadIds.slice(i, i + FETCH_CONCURRENCY);
        const fetched = await Promise.all(
          batch.map(async (threadId) => {
            try {
              return await getThreadForInbox(gmail, threadId);
            } catch (err) {
              // A single unreadable thread (deleted mid-sync, or a permissions edge) must not
              // abort the rest of the batch.
              console.error(`[inbox sync] thread ${threadId} failed on ${account.email}:`, err);
              return null;
            }
          })
        );
        for (const thread of fetched) {
          if (!thread) continue;
          await upsertThread(account.id, account.email, thread, { withBodies: false });
          threadsSynced++;
        }
      }

      // Only advance the cursor once the batch landed — a crash mid-sync should re-do work, never
      // skip it. Held back during backfill so the remaining pages still get picked up next run.
      const backfillComplete = threadIds.length < MAX_THREADS_PER_SYNC;
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          inboxSyncedAt: new Date(),
          ...(nextHistoryId && backfillComplete ? { lastHistoryId: nextHistoryId } : {}),
        },
      });
    } catch (err) {
      console.error(`[inbox sync] account ${account.email} failed:`, err);
    }
  }

  return { threadsSynced };
}

/** Re-pulls one conversation from Gmail immediately — used right after sending a reply so the
 * thread shows it without waiting for the next scheduled sync. */
export async function refreshThread(threadId: string) {
  const thread = await prisma.inboxThread.findUnique({
    where: { id: threadId },
    include: { emailAccount: true },
  });
  if (!thread) return;
  const gmail = await gmailClientFor(thread.emailAccountId);
  const fetched = await getThreadForInbox(gmail, thread.gmailThreadId, { withBodies: true });
  await upsertThread(thread.emailAccountId, thread.emailAccount.email, fetched, { withBodies: true });
}

/**
 * Returns a thread with its bodies, fetching and caching them from Gmail on first open. Called
 * when someone actually reads a conversation, which is the only time full bodies are worth
 * pulling.
 */
export async function loadThreadWithBodies(threadId: string) {
  const thread = await prisma.inboxThread.findUnique({
    where: { id: threadId },
    include: { messages: { orderBy: { sentAt: "asc" } }, emailAccount: true },
  });
  if (!thread) return null;

  const missingBodies = thread.messages.some((m) => m.bodyText === null && m.bodyHtml === null);
  if (!thread.bodiesFetchedAt || missingBodies || thread.messages.length !== thread.messageCount) {
    try {
      const gmail = await gmailClientFor(thread.emailAccountId);
      const fetched = await getThreadForInbox(gmail, thread.gmailThreadId, { withBodies: true });
      await upsertThread(thread.emailAccountId, thread.emailAccount.email, fetched, { withBodies: true });
      return prisma.inboxThread.findUnique({
        where: { id: threadId },
        include: { messages: { orderBy: { sentAt: "asc" } }, emailAccount: true },
      });
    } catch (err) {
      // Fall through to whatever's cached — a stale read beats an error page.
      console.error(`[inbox] failed to fetch bodies for thread ${threadId}:`, err);
    }
  }
  return thread;
}
