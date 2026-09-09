/**
 * The team operates out of India — every EmailAccount defaults to this timezone (see
 * prisma/schema.prisma). Used as the default for rendering dates into human-readable text on the
 * server, where the bare `Date.prototype.toLocaleString()` would otherwise resolve to the
 * *server's* timezone (UTC on Vercel), not the team's — the actual scheduled instant is stored
 * correctly either way, but showing "4:30 AM" for a moment someone deliberately picked as
 * "10:00 AM" reads as a bug even though nothing about the underlying schedule is wrong.
 */
export const BUSINESS_TIMEZONE = "Asia/Kolkata";

/** Same output shape as the default `Date.prototype.toLocaleString()` (e.g. "9/10/2026, 10:00:00
 * AM"), but pinned to a specific timezone instead of whatever the running process's own is. */
export function formatDateTime(date: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

/** Same output shape as `Date.prototype.toLocaleDateString()` (e.g. "9/10/2026"), timezone-pinned. */
export function formatDateOnly(date: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).format(date);
}
