import { NextResponse } from "next/server";
import { syncInbox } from "@/lib/inboxSync";

// Syncing several threads can take a while on a first run — give it room rather than letting the
// platform's default cut it off mid-batch.
export const maxDuration = 60;

/** Manual "check mail now", for when waiting for the next worker tick isn't good enough. */
export async function POST() {
  try {
    const result = await syncInbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
