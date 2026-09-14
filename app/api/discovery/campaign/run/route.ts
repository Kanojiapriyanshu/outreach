import { NextRequest, NextResponse } from "next/server";
import { normalizeProfile } from "@/lib/discovery/campaignProfile";
import { DEPTH_SETTINGS, runCampaignDiscovery, type DiscoveryDepth } from "@/lib/discovery/campaignDiscovery";

// A deep run searches dozens of queries and reads the history of up to 70 creators — the pipeline
// keeps its own time budgets well inside this.
export const maxDuration = 300;

/**
 * Runs campaign discovery and streams progress as newline-delimited JSON: `stage` and `progress`
 * events while it works, then one `result` (or `error`) line. Streaming rather than one long silent
 * request, so the person waiting sees creators being found and analyzed.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { profile?: unknown; depth?: unknown };
  const profile = normalizeProfile(body.profile);
  if (profile.targetProducts.length === 0) {
    return NextResponse.json({ error: "Add at least one target product before running discovery" }, { status: 400 });
  }
  const depth: DiscoveryDepth = typeof body.depth === "string" && body.depth in DEPTH_SETTINGS ? (body.depth as DiscoveryDepth) : "standard";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (payload: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // The browser went away mid-run; the work still finishes and saves to the Library.
          open = false;
        }
      };
      try {
        const result = await runCampaignDiscovery(profile, depth, send);
        send({ type: "result", result });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Discovery failed" });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
