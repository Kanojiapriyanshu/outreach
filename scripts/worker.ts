import "dotenv/config";
import { runTickWithHeartbeat } from "../lib/workerTick";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5 * 60 * 1000);

async function tick() {
  const result = await runTickWithHeartbeat();
  if (!result.ok) {
    console.error(`[worker ${result.startedAt}] error:`, result.error);
    return;
  }
  if (result.repliesFound > 0) {
    console.log(`[worker ${result.startedAt}] found ${result.repliesFound} reply/bounce/unsubscribe event(s):`, result.replyResults);
  }
  if (result.actionsProcessed > 0) {
    console.log(`[worker ${result.startedAt}] processed ${result.actionsProcessed} action(s):`, result.actionResults);
  }
  if (result.repliesFound === 0 && result.actionsProcessed === 0) {
    console.log(`[worker ${result.startedAt}] nothing to do.`);
  }
}

// A single bad Gmail/DB response must never kill the whole process — log and keep polling.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandled rejection (continuing):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaught exception (continuing):", err);
});

console.log(`Fidem Growth outreach worker starting. Polling every ${POLL_INTERVAL_MS / 1000}s.`);
tick();
setInterval(tick, POLL_INTERVAL_MS);
