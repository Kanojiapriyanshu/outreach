import "dotenv/config";
import { runTickWithHeartbeat } from "../lib/workerTick";

// Set WORKER_POLL_INTERVAL_MS to force a fixed cadence; otherwise the worker ticks as often as each
// tick asks (see lib/workerCadence.ts) — fast while emails are going out, and 15 minutes to an hour
// apart when there's nothing to send, so the database can sleep.
const FIXED_INTERVAL_MS = process.env.WORKER_POLL_INTERVAL_MS ? Number(process.env.WORKER_POLL_INTERVAL_MS) : null;

async function tick(): Promise<number> {
  const result = await runTickWithHeartbeat();
  if (!result.ok) {
    console.error(`[worker ${result.startedAt}] error:`, result.error);
    return result.nextTickInSeconds;
  }
  if (result.repliesFound > 0) {
    console.log(`[worker ${result.startedAt}] found ${result.repliesFound} reply/bounce/unsubscribe event(s):`, result.replyResults);
  }
  if (result.initialEmailsSent > 0) {
    console.log(`[worker ${result.startedAt}] sent ${result.initialEmailsSent} scheduled Email 1(s):`, result.initialEmailResults);
  }
  if (result.actionsProcessed > 0) {
    console.log(`[worker ${result.startedAt}] processed ${result.actionsProcessed} action(s):`, result.actionResults);
  }
  if (result.newMailFound > 0) {
    console.log(`[worker ${result.startedAt}] found ${result.newMailFound} new untracked inbox message(s).`);
  }
  if (result.repliesFound === 0 && result.initialEmailsSent === 0 && result.actionsProcessed === 0 && result.newMailFound === 0) {
    console.log(`[worker ${result.startedAt}] nothing to do — next tick in ${result.nextTickInSeconds}s.`);
  }
  return result.nextTickInSeconds;
}

// A single bad Gmail/DB response must never kill the whole process — log and keep polling.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandled rejection (continuing):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaught exception (continuing):", err);
});

async function loop() {
  let nextInSeconds = 60;
  try {
    nextInSeconds = await tick();
  } catch (err) {
    console.error("[worker] tick crashed (continuing):", err);
  }
  setTimeout(loop, FIXED_INTERVAL_MS ?? nextInSeconds * 1000);
}

console.log(
  FIXED_INTERVAL_MS
    ? `Fidem Growth outreach worker starting. Polling every ${FIXED_INTERVAL_MS / 1000}s.`
    : "Fidem Growth outreach worker starting. Ticking as often as the schedule needs."
);
void loop();
