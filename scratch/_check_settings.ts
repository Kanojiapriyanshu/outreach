import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const settings = await prisma.automationSettings.findFirst();
  console.log("sendSpacingSecondsMin:", settings?.sendSpacingSecondsMin, "Max:", settings?.sendSpacingSecondsMax);
  const heartbeat = await prisma.workerHeartbeat.findFirst();
  console.log("heartbeat:", heartbeat);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
