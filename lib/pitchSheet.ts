/**
 * Pitch sheets — a creator shortlist sent to a brand as one no-login link. Pure helpers only
 * (no Prisma, no I/O) so the rules here are shared by the API, the dialog and the tests.
 */
import { formatMoney } from "@/lib/creatorReplyAnalysis";

export const DEFAULT_EXPIRY_DAYS = 30;
export const MAX_EXPIRY_DAYS = 365;
export const EXPIRY_CHOICES = [7, 14, 30, 60, 90, 0] as const; // 0 = never
const DAY_MS = 24 * 60 * 60 * 1000;

export type LinkState = "live" | "expired" | "turned-off";

/** What decides whether a creator may go on a brand's sheet. */
export interface PitchEligibilityInput {
  replied: boolean;
  hasRate: boolean;
}

/**
 * Only creators who answered us or already gave a price go on a sheet. Anyone else hasn't agreed
 * to anything yet, so putting them in front of a brand would promise something we can't deliver.
 */
export function isReadyToPitch(c: PitchEligibilityInput): boolean {
  return c.replied || c.hasRate;
}

export function notReadyReason(c: PitchEligibilityInput): string | null {
  return isReadyToPitch(c) ? null : "Hasn't replied and no rate yet";
}

export function expiryFromDays(days: number | null | undefined, now = new Date()): Date | null {
  if (days === 0) return null;
  const n = Number.isFinite(days) && (days as number) > 0 ? Math.min(Math.round(days as number), MAX_EXPIRY_DAYS) : DEFAULT_EXPIRY_DAYS;
  return new Date(now.getTime() + n * DAY_MS);
}

export function linkState(sheet: { expiresAt: Date | string | null; revokedAt: Date | string | null }, now = new Date()): LinkState {
  if (sheet.revokedAt) return "turned-off";
  if (sheet.expiresAt && new Date(sheet.expiresAt).getTime() <= now.getTime()) return "expired";
  return "live";
}

export function daysLeft(expiresAt: Date | string | null, now = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS));
}

/**
 * The creator's quote plus our margin, rounded up to a clean number (nearest 50) so a brand never
 * sees something like $1,138.50 that gives the markup away.
 */
export function brandRateFromQuote(quote: number | null, marginPercent: number): number | null {
  if (quote === null || !Number.isFinite(quote)) return null;
  const margin = Number.isFinite(marginPercent) ? Math.max(0, marginPercent) : 0;
  const raw = quote * (1 + margin / 100);
  return margin === 0 ? quote : Math.ceil(raw / 50) * 50;
}

/** "Dedicated video — $1,500" / "Product + $1,500" / "Rate on request". */
export function brandRateLine(item: { brandRate: number | null; brandRateCurrency: string | null; deliverable: string | null; rateNote: string | null }): string {
  const price = item.brandRate !== null ? formatMoney(item.brandRate, item.brandRateCurrency ?? "USD") : null;
  const main = [item.deliverable?.trim(), price].filter(Boolean).join(" — ");
  const note = item.rateNote?.trim();
  if (main && note) return `${main} (${note})`;
  return main || note || "Rate on request";
}

/** The email the team sends the brand themselves — the app never sends it. */
export function brandEmailDraft(params: { brandName: string; url: string; creatorNames: string[]; expiresAt: Date | string | null }): { subject: string; body: string } {
  const { brandName, url, creatorNames, expiresAt } = params;
  const count = creatorNames.length;
  const subject = `Creator shortlist for ${brandName} — ${count} creator${count === 1 ? "" : "s"}`;
  const listed = creatorNames.slice(0, 12).map((n) => `• ${n}`).join("\n");
  const more = count > 12 ? `\n• …and ${count - 12} more` : "";
  const until = expiresAt
    ? ` The link stays open until ${new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
    : "";
  const body = [
    `Hi ${brandName} team,`,
    "",
    `Here's the creator shortlist we put together for you — each creator's channel, media kit and rate are on the page:`,
    url,
    "",
    listed + more,
    "",
    `Let us know which creators you'd like to move forward with, or if you'd like options in another niche or budget.${until}`,
    "",
    "Thanks,",
    "The Fidem Growth Team",
  ].join("\n");
  return { subject, body };
}

/** Opens Gmail's compose window pre-filled — the team reviews and presses Send themselves. */
export function gmailComposeUrl(to: string | null, subject: string, body: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", su: subject, body });
  if (to) params.set("to", to);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
