import { NextRequest, NextResponse } from "next/server";
import { runTickWithHeartbeat } from "@/lib/workerTick";

// A tick can involve several Gmail API round-trips per active sequence — give it real headroom
// on Vercel's serverless timeout rather than the 10s default.
export const maxDuration = 60;

/**
 * Runs one worker tick on demand — meant to be called by an external scheduler (a GitHub Actions
 * cron workflow, by default) every few minutes, standing in for a persistent always-on worker
 * process when there's no host willing to run one for free. Gated by CRON_SECRET since this
 * route sits outside the normal session-auth middleware (an external scheduler has no session
 * cookie) — anyone with the secret can trigger a tick, so treat it like a password.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTickWithHeartbeat();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
