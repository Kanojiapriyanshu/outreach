import { prisma } from "@/lib/prisma";

// Same fixed +5:30 offset trick as lib/businessDays.ts — IST has no DST, so shifting by a
// constant and reading UTC fields off the shifted instant gives correct IST wall-clock fields
// regardless of what timezone the process itself is running in (UTC on Vercel).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function startOfToday(): Date {
  const now = new Date();
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnightUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(istMidnightUtc - IST_OFFSET_MS);
}

/** Counts follow-ups + tracked Email 1s sent from this account since midnight IST — not the
 * server process's own local midnight, which on Vercel is UTC (5.5 hours off from the business's
 * actual day boundary). */
export async function getSentTodayCount(emailAccountId: string): Promise<number> {
  return prisma.emailMessage.count({
    where: {
      direction: "OUT",
      sentAt: { gte: startOfToday() },
      sequence: { emailAccountId },
    },
  });
}

/** Gmail's own cap is ~500/day for consumer accounts, ~2000 for Workspace; dailySendLimit defaults conservatively below that. */
export async function isUnderDailyLimit(emailAccountId: string, dailySendLimit: number): Promise<boolean> {
  const sentToday = await getSentTodayCount(emailAccountId);
  return sentToday < dailySendLimit;
}
