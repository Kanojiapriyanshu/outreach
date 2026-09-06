import { prisma } from "@/lib/prisma";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Counts follow-ups + tracked Email 1s sent from this account since midnight, local server time. */
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
