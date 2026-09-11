/**
 * Read-tracking services (Mailsuite, Mailtrack) email their "they opened it" notifications back to
 * the sender, and because those carry the original subject and References headers, Gmail threads
 * them straight into the real conversation.
 *
 * That's actively harmful, not just noisy: a reply's recipient is taken from the most recent
 * inbound message, so a tracking notification arriving after someone's actual reply would address
 * the reply to the tracking robot instead of to the person.
 *
 * Deliberately a list of specific tracking vendors rather than a blanket "noreply@" rule — plenty
 * of no-reply senders are mail someone genuinely needs to see.
 *
 * Kept in its own dependency-free module because both the sync (server, imports Prisma) and the
 * thread view (client) need it, and the client must not pull server code into its bundle.
 */
const TRACKING_NOTIFICATION_DOMAINS = ["mailsuite.com", "mailtrack.me", "mailtrack.io"];

export function isTrackingNotification(fromAddress: string): boolean {
  const domain = fromAddress.toLowerCase().trim().split("@")[1] ?? "";
  return TRACKING_NOTIFICATION_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}
