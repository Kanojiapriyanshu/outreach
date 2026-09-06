import "dotenv/config";
import { runWorkerTick } from "../lib/scheduler";
import { prisma } from "../lib/prisma";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5 * 60 * 1000);

async function recordHeartbeat(ok: boolean, actionsChecked: number, error?: string) {
  try {
    const existing = await prisma.workerHeartbeat.findFirst();
    const data = { lastRunAt: new Date(), lastRunOk: ok, lastError: error ?? null, actionsChecked };
    if (existing) {
      await prisma.workerHeartbeat.update({ where: { id: existing.id }, data });
    } else {
      await prisma.workerHeartbeat.create({ data });
    }
  } catch (e) {
    // If even the heartbeat write fails (e.g. DB is briefly unreachable), just log —
    // this must never be the thing that takes the worker process down.
    console.error("[worker] failed to record heartbeat:", e);
  }
}

async function tick() {
  const startedAt = new Date().toISOString();
  try {
    const { repliesFound, actionsProcessed, replyResults, actionResults } = await runWorkerTick();
    await recordHeartbeat(true, actionsProcessed);
    if (repliesFound > 0) {
      console.log(`[worker ${startedAt}] found ${repliesFound} reply/bounce/unsubscribe event(s):`, replyResults);
    }
    if (actionsProcessed > 0) {
      console.log(`[worker ${startedAt}] processed ${actionsProcessed} action(s):`, actionResults);
    }
    if (repliesFound === 0 && actionsProcessed === 0) {
      console.log(`[worker ${startedAt}] nothing to do.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker ${startedAt}] error:`, err);
    await recordHeartbeat(false, 0, message);
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
