import { runWorkerTick } from "@/lib/scheduler";
import { prisma } from "@/lib/prisma";

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
    // this must never be the thing that fails the whole tick.
    console.error("[worker] failed to record heartbeat:", e);
  }
}

type TickResult =
  | {
      ok: true;
      startedAt: string;
      repliesFound: number;
      actionsProcessed: number;
      replyResults: unknown;
      actionResults: unknown;
    }
  | { ok: false; startedAt: string; error: string };

/**
 * One full tick: check every active thread for events, process due follow-ups, record a
 * heartbeat. Shared by the standalone always-on script (scripts/worker.ts, for anyone
 * self-hosting a persistent process) and the cron-triggered API route (app/api/cron/tick) used
 * when there's no persistent worker host — a scheduled GitHub Actions job hits that route on
 * an interval instead.
 */
export async function runTickWithHeartbeat(): Promise<TickResult> {
  const startedAt = new Date().toISOString();
  try {
    const { repliesFound, actionsProcessed, replyResults, actionResults } = await runWorkerTick();
    await recordHeartbeat(true, actionsProcessed);
    return { ok: true, startedAt, repliesFound, actionsProcessed, replyResults, actionResults };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker ${startedAt}] error:`, err);
    await recordHeartbeat(false, 0, message);
    return { ok: false, startedAt, error: message };
  }
}
