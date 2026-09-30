/**
 * How long the worker waits before its next tick. The database is Neon's free plan, which is
 * metered in compute-hours and only sleeps after 5 idle minutes — a tick every 30 seconds kept it
 * awake the whole month and ran the quota out by mid-month. So the worker now only wakes when
 * there's something to do:
 *
 * - emails due right now: tick again as soon as the send-spacing gate allows (sends are one per
 *   tick, spaced 30s-3min apart, so a morning's follow-ups still drain in one sitting);
 * - otherwise: wake exactly when the next scheduled email is due,
 * - but never sleep longer than 15 minutes during the working day (08:00-24:00 IST, weekdays), so
 *   replies are noticed within ~15 min — or an hour overnight and at weekends, when nothing is
 *   scheduled to send and nobody is there to answer. Opening the CRM syncs Gmail on the spot
 *   (app/api/sync/catch-up), so a longer sleep never means a stale screen.
 *
 * Pure (no Prisma, no I/O) so the rules are testable.
 */
import { BUSINESS_TIMEZONE } from "@/lib/formatDate";

export const BURST_TICK_SECONDS = 30;
export const WORKDAY_TICK_SECONDS = 15 * 60;
export const QUIET_TICK_SECONDS = 60 * 60;
/** Working day, IST: from this hour until midnight. */
const WORKDAY_START_HOUR = 8;

/** The longest the worker ever goes quiet on purpose — anything longer means it has stopped. */
export const MAX_PLANNED_GAP_MS = QUIET_TICK_SECONDS * 1000;
/** When the app treats the worker as stopped: its longest planned gap plus a margin. */
export const WORKER_SILENT_MS = MAX_PLANNED_GAP_MS + 15 * 60 * 1000;

export function isBusinessWeekend(date: Date, timeZone: string = BUSINESS_TIMEZONE): boolean {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return day === "Sat" || day === "Sun";
}

/** Weekday, 08:00-24:00 in the team's timezone. */
export function isWorkingHours(date: Date, timeZone: string = BUSINESS_TIMEZONE): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).format(date)) % 24;
  return !isBusinessWeekend(date, timeZone) && hour >= WORKDAY_START_HOUR;
}

export function nextTickDelaySeconds(input: {
  now: Date;
  /** Emails that could go out right now (due, and on a sequence/inbox that can send). */
  dueNow: number;
  /** The send-spacing gate: no send before this moment. */
  nextSendAllowedAt: Date | null;
  /** The earliest scheduled email that isn't due yet. */
  nextDueAt: Date | null;
}): number {
  const { now, dueNow, nextSendAllowedAt, nextDueAt } = input;
  const ceiling = isWorkingHours(now) ? WORKDAY_TICK_SECONDS : QUIET_TICK_SECONDS;
  const secondsUntil = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 1000);

  if (dueNow > 0) {
    const gate = nextSendAllowedAt ? secondsUntil(nextSendAllowedAt) : 0;
    return Math.min(ceiling, Math.max(BURST_TICK_SECONDS, gate));
  }
  if (nextDueAt) {
    // A few seconds past the due time, so the email is definitely due when the tick lands.
    return Math.min(ceiling, Math.max(BURST_TICK_SECONDS, secondsUntil(nextDueAt) + 5));
  }
  return ceiling;
}
