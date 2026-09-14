import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const now = new Date();
  const overdueScheduled = await prisma.scheduledInitialEmail.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
  });
  const overdueActions = await prisma.scheduledAction.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
  });
  console.log("now (UTC):", now.toISOString());
  console.log("Overdue ScheduledInitialEmail rows:", overdueScheduled.length);
  for (const s of overdueScheduled) {
    const minutesLate = Math.round((now.getTime() - s.scheduledAt.getTime()) / 60000);
    console.log(" -", s.id, "scheduledAt:", s.scheduledAt.toISOString(), `(${minutesLate} min late)`, "kind:", s.kind);
  }
  console.log("Overdue ScheduledAction rows:", overdueActions.length);
  for (const a of overdueActions) {
    const minutesLate = Math.round((now.getTime() - a.scheduledAt.getTime()) / 60000);
    console.log(" -", a.id, "seq:", a.sequenceId, "scheduledAt:", a.scheduledAt.toISOString(), `(${minutesLate} min late)`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
