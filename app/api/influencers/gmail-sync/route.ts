import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GmailReauthError } from "@/lib/gmail";
import { importGmailCreatorThread, scanGmailForCreatorReplies, type ImportSelection } from "@/lib/gmailCreatorSync";

export const maxDuration = 300;

const MAX_IMPORT_PER_REQUEST = 4;

async function connectedAccountId(): Promise<string | null> {
  const account = await prisma.emailAccount.findFirst({ where: { accessStatus: "CONNECTED" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return account?.id ?? null;
}

/**
 * { action: "scan", days } — list creator conversations started from Gmail that aren't tracked yet.
 * { action: "import", items } — add the reviewed ones (a few per request; the dialog batches).
 * Neither sends or schedules any email.
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; days?: number; items?: ImportSelection[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const accountId = await connectedAccountId();
  if (!accountId) return NextResponse.json({ error: "Connect Gmail in Settings first." }, { status: 400 });

  try {
    if (body.action === "scan") {
      const days = typeof body.days === "number" ? body.days : 7;
      return NextResponse.json({ candidates: await scanGmailForCreatorReplies(accountId, days) });
    }
    if (body.action === "import") {
      const items = (body.items ?? []).filter((i) => typeof i?.gmailThreadId === "string").slice(0, MAX_IMPORT_PER_REQUEST);
      if (items.length === 0) return NextResponse.json({ error: "Nothing selected" }, { status: 400 });
      const results = [];
      for (const item of items) results.push(await importGmailCreatorThread(accountId, item));
      return NextResponse.json({ results });
    }
  } catch (err) {
    if (err instanceof GmailReauthError) return NextResponse.json({ error: "Gmail access expired — reconnect it in Settings." }, { status: 401 });
    throw err;
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
