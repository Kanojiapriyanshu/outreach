import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSentTodayCount } from "@/lib/quota";

export async function GET() {
  const [settings, accounts, suppressed, heartbeat] = await Promise.all([
    prisma.automationSettings.findFirst(),
    prisma.emailAccount.findMany({
      select: {
        id: true,
        email: true,
        provider: true,
        accessStatus: true,
        timezone: true,
        dailySendLimit: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.suppressedContact.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.workerHeartbeat.findFirst({ orderBy: { lastRunAt: "desc" } }),
  ]);

  const emailAccounts = await Promise.all(
    accounts.map(async (a) => ({ ...a, sentToday: await getSentTodayCount(a.id) }))
  );

  return NextResponse.json({ settings, emailAccounts, suppressed, heartbeat });
}

export async function PUT(req: NextRequest) {
  const data = await req.json();
  const settings = await prisma.automationSettings.findFirstOrThrow();
  const updated = await prisma.automationSettings.update({
    where: { id: settings.id },
    data: {
      brandDelayDays1: data.brandDelayDays1,
      brandDelayDays2: data.brandDelayDays2,
      brandDelayDays3: data.brandDelayDays3,
      creatorDelayDays1: data.creatorDelayDays1,
      creatorDelayDays2: data.creatorDelayDays2,
      creatorDelayDays3: data.creatorDelayDays3,
      sendWindowStartHour: data.sendWindowStartHour,
      sendWindowStartMinute: data.sendWindowStartMinute,
      sendWindowEndHour: data.sendWindowEndHour,
      sendWindowEndMinute: data.sendWindowEndMinute,
      sendWindowDays: data.sendWindowDays,
      sendSpacingSecondsMin: data.sendSpacingSecondsMin,
      sendSpacingSecondsMax: data.sendSpacingSecondsMax,
      nonCommittalDelayDays: data.nonCommittalDelayDays,
    },
  });
  return NextResponse.json({ settings: updated });
}
