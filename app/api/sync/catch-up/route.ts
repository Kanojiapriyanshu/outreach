import { NextResponse } from "next/server";
import { runCatchUpSync } from "@/lib/scheduler";

// A Gmail sync plus a reply check can take most of a minute on a busy inbox.
export const maxDuration = 60;

/**
 * Sync-on-open: called by the CRM when someone opens it or comes back to its tab. The worker may be
 * asleep for up to an hour, so this brings Gmail and replies up to date on the spot. Behind the
 * normal login; at most one run every 5 minutes however many tabs ask (see runCatchUpSync).
 */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, ...(await runCatchUpSync()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[catch-up sync] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
