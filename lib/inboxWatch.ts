import { prisma } from "@/lib/prisma";
import { gmailClientFor, listRecentInboxMessageIds, getInboxMessageMetadata, parseFromHeader } from "@/lib/gmail";

// How far back into each account's inbox to look every tick — generous enough that a tick
// running a few minutes late (GitHub Actions cron can slip) never misses something, cheap enough
// (one list call, no per-message fetch) that it's fine to re-scan the same recent window every
// 5 minutes. Genuinely new candidates are the only ones that cost an extra API call — see below.
const INBOX_SCAN_SIZE = 25;

/**
 * Finds inbound Gmail messages that don't belong to any tracked OutreachSequence thread — a
 * brand-new contact emailing in, or a reply on a thread the team never attached to the CRM — and
 * records them as InboxAlert rows so they show up in the notifications bell. This is deliberately
 * separate from runContinuousReplyCheck: that one only ever looks at threads the CRM already
 * knows about (and logs REPLY_DETECTED etc. against a sequence); this one exists specifically to
 * catch what's *not* being tracked yet, so nothing lands in Gmail without the team also seeing it
 * here and getting the chance to decide whether to respond, start tracking it, or ignore it.
 */
export async function scanInboxForNewMail() {
  const accounts = await prisma.emailAccount.findMany({ where: { accessStatus: "CONNECTED" } });
  let created = 0;

  for (const account of accounts) {
    try {
      const [candidates, trackedThreads] = await Promise.all([
        (async () => {
          const gmail = await gmailClientFor(account.id);
          return listRecentInboxMessageIds(gmail, INBOX_SCAN_SIZE);
        })(),
        prisma.outreachSequence.findMany({ where: { emailAccountId: account.id }, select: { threadId: true } }),
      ]);

      const trackedThreadIds = new Set(trackedThreads.map((s) => s.threadId));
      const untracked = candidates.filter((c) => !trackedThreadIds.has(c.threadId));
      if (untracked.length === 0) continue;

      const alreadyRecorded = new Set(
        (
          await prisma.inboxAlert.findMany({
            where: { emailAccountId: account.id, gmailMessageId: { in: untracked.map((c) => c.id) } },
            select: { gmailMessageId: true },
          })
        ).map((a) => a.gmailMessageId)
      );
      const genuinelyNew = untracked.filter((c) => !alreadyRecorded.has(c.id));
      if (genuinelyNew.length === 0) continue;

      const gmail = await gmailClientFor(account.id);
      for (const candidate of genuinelyNew) {
        try {
          const meta = await getInboxMessageMetadata(gmail, candidate.id);
          const { name, address } = parseFromHeader(meta.from);
          // A copy of our own sent mail can land in INBOX too (self-CC, or a provider that
          // threads sent mail into the inbox view) — that's not a new contact reaching out.
          if (address.toLowerCase() === account.email.toLowerCase()) continue;

          await prisma.inboxAlert.create({
            data: {
              emailAccountId: account.id,
              gmailMessageId: candidate.id,
              gmailThreadId: candidate.threadId,
              fromAddress: address,
              fromName: name,
              subject: meta.subject,
              snippet: meta.snippet,
              receivedAt: meta.internalDate,
            },
          });
          created++;
        } catch (err) {
          // A unique-constraint hit (another tick recorded the same message concurrently) or a
          // one-off Gmail API hiccup on a single message shouldn't stop the rest of the batch.
          console.error(`[inbox watch] failed for message ${candidate.id} on ${account.email}:`, err);
        }
      }
    } catch (err) {
      console.error(`[inbox watch] failed for account ${account.email}:`, err);
    }
  }

  return { created };
}
