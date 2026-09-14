import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const heartbeat = await prisma.workerHeartbeat.findFirst();
  console.log("now:", new Date().toISOString());
  console.log("heartbeat:", heartbeat);

  const account = await prisma.emailAccount.findFirst();
  console.log("account accessStatus:", account?.accessStatus, "dailySendLimit:", account?.dailySendLimit);

  const sentToday = await prisma.emailMessage.count({
    where: { direction: "OUT", sentAt: { gte: new Date(new Date().toISOString().slice(0,10)) } },
  });
  console.log("emails sent (rough, since UTC midnight):", sentToday);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
