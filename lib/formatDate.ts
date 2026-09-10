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

// Same fixed +5:30 offset trick as lib/businessDays.ts — IST has no DST, so this is exact.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The UTC instant for midnight IST on a "YYYY-MM-DD" date string — the inclusive start of that
 * IST calendar day, for building date-range filters (e.g. a `createdAt: { gte, lte } ` query)
 * that mean what a user typing a date in a `<input type="date">` picker actually expects. */
export function istDayStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** The UTC instant for the last millisecond of that same IST calendar day — the inclusive end. */
export function istDayEnd(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - IST_OFFSET_MS - 1);
}
