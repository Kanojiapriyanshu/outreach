import { prisma } from "@/lib/prisma";

/**
 * Replies written from an outreach page and scheduled to send later, by the sequence they answer —
 * so the Brand and Influencer lists can say "your reply is scheduled for …" on that row. There are
 * only ever a handful of pending scheduled emails, so they're read whole and matched here rather
 * than queried by JSON path.
 */
export async function scheduledRepliesBySequence(): Promise<Map<string, Date>> {
  const pending = await prisma.scheduledInitialEmail.findMany({
    where: { status: "PENDING", kind: "PLAIN" },
    select: { scheduledAt: true, payload: true },
  });
  const bySequence = new Map<string, Date>();
  for (const row of pending) {
    const sequenceId = (row.payload as { reply?: { sequenceId?: string | null } } | null)?.reply?.sequenceId;
    if (sequenceId) bySequence.set(sequenceId, row.scheduledAt);
  }
  return bySequence;
}
