import { NextResponse } from "next/server";
import { runTickWithHeartbeat } from "@/lib/workerTick";

// One full tick can take most of a minute (sends, reply check or inbox scan, enrichment).
export const maxDuration = 60;

/**
 * "Run automation now" on the Settings page: runs one worker tick immediately, for when the
 * automation has gone quiet and the team doesn't want to wait for the worker to come back. Behind
 * the normal login (unlike /api/cron/tick, which uses CRON_SECRET for the external scheduler).
 * Safe to press while the worker is also running — every send is claimed before it happens.
 */
export async function POST() {
  const result = await runTickWithHeartbeat();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    initialEmailsSent: result.initialEmailsSent,
    followUpsProcessed: result.actionsProcessed,
    repliesFound: result.repliesFound,
    newMailFound: result.newMailFound,
  });
}
