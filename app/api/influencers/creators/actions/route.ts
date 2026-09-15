import { NextRequest, NextResponse } from "next/server";
import { ensureCreatorMediaKit, findAndSaveCreatorEmail } from "@/lib/creatorEnrichment";

export const maxDuration = 60;

// Sized so one request finishes well inside the function limit; the page sends larger selections
// in batches of this size.
const MAX_EMAIL_LOOKUPS = 9;
const MAX_MEDIA_KITS = 3;
const EMAIL_CONCURRENCY = 3;

interface ActionBody {
  action: "find-email" | "media-kit";
  creatorIds: string[];
  force?: boolean;
}

/** Roster actions on one or a few creators: look for their email, or make/refresh their media kit. */
export async function POST(req: NextRequest) {
  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const ids = [...new Set((body.creatorIds ?? []).filter((id) => typeof id === "string" && id))];
  if (ids.length === 0) return NextResponse.json({ error: "Pick at least one creator" }, { status: 400 });

  if (body.action === "find-email") {
    if (ids.length > MAX_EMAIL_LOOKUPS) return NextResponse.json({ error: `At most ${MAX_EMAIL_LOOKUPS} creators per request` }, { status: 400 });
    const results = [];
    for (let i = 0; i < ids.length; i += EMAIL_CONCURRENCY) {
      const chunk = ids.slice(i, i + EMAIL_CONCURRENCY);
      results.push(...(await Promise.all(chunk.map(async (creatorId) => ({ creatorId, ...(await findAndSaveCreatorEmail(creatorId, { deadlineMs: 15_000 })) })))));
    }
    return NextResponse.json({ results });
  }

  if (body.action === "media-kit") {
    if (ids.length > MAX_MEDIA_KITS) return NextResponse.json({ error: `At most ${MAX_MEDIA_KITS} creators per request` }, { status: 400 });
    const base = process.env.APP_BASE_URL?.replace(/\/$/, "") || req.nextUrl.origin;
    const results = [];
    for (const creatorId of ids) {
      try {
        const kit = await ensureCreatorMediaKit(creatorId, { force: !!body.force });
        results.push({ creatorId, ok: true, mediaKitId: kit.mediaKitId, url: `${base}/media-kit/shared/${kit.shareToken}`, reused: kit.reused });
      } catch (err) {
        results.push({ creatorId, ok: false, error: err instanceof Error ? err.message : "Couldn't make the media kit" });
      }
    }
    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
