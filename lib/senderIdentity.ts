/**
 * Decides whether a message in a thread was sent by the team or by the other side. The reply
 * checker needs this for every new message: "ours" means a hand-typed send to track, anything else
 * is a reply to read.
 *
 * "Ours" is defined positively — one of the team's connected inboxes, or a teammate on the company's
 * own domain — rather than "anything not from the address we emailed". The old definition turned a
 * reply from a creator's manager or agency (a different address), and even mailer-daemon bounces,
 * into "a message you sent from Gmail", so those replies never showed.
 */

// Shared mailbox providers: an account on one of these says nothing about who else at that domain is
// on the team, so only the exact connected address counts there.
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "yandex.com",
]);

/** "Jane Doe <Jane@Brand.com>" -> "jane@brand.com"; a bare address is returned lowercased. */
export function emailAddressOf(fromHeader: string): string {
  const angle = fromHeader.match(/<([^>]+)>/);
  return (angle ? angle[1] : fromHeader).trim().toLowerCase();
}

export function ownSenderMatcher(accountEmails: string[]): (fromHeader: string) => boolean {
  const addresses = new Set(accountEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const domains = new Set(
    [...addresses].map((e) => e.split("@")[1]).filter((d): d is string => !!d && !PERSONAL_EMAIL_DOMAINS.has(d))
  );
  return (fromHeader: string) => {
    const address = emailAddressOf(fromHeader);
    return addresses.has(address) || domains.has(address.split("@")[1] ?? "");
  };
}
