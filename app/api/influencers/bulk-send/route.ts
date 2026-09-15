import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleInitialEmail } from "@/lib/trackSequence";
import { clampToSendingWindow, sendingWindowFor } from "@/lib/businessDays";
import { CREATOR_VARIABLES } from "@/lib/templates";

export const maxDuration = 60;

const MAX_ITEMS = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface BulkItem {
  creatorId: string;
  to: string;
  subject: string;
  body: string;
  variables?: Record<string, string>;
}

interface BulkSendBody {
  items: BulkItem[];
  /** "window" (default) queues for the next sending window; "now" queues for immediately. */
  sendMode?: "window" | "now";
  emailAccountId?: string;
}

/**
 * Pitches many creators at once. Nothing is sent inside this request: every email is queued as a
 * scheduled Email 1 and the worker sends them one at a time with the usual random spacing, daily
 * limit and suppression checks — a burst of identical sends from one inbox is how outreach lands in
 * spam. Each one then gets the normal influencer follow-ups and reply handling.
 */
export async function POST(req: NextRequest) {
  let body: BulkSendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
  if (items.length > MAX_ITEMS) return NextResponse.json({ error: `At most ${MAX_ITEMS} emails per batch` }, { status: 400 });

  const account = body.emailAccountId
    ? await prisma.emailAccount.findFirst({ where: { id: body.emailAccountId, accessStatus: "CONNECTED" } })
    : await prisma.emailAccount.findFirst({ where: { accessStatus: "CONNECTED" } });
  if (!account) return NextResponse.json({ error: "No connected Gmail account — connect one in Settings first." }, { status: 400 });

  const settings = await prisma.automationSettings.findFirstOrThrow();
  // "window" means the influencer window (evenings IST by default), same as their follow-ups.
  const scheduledAt = body.sendMode === "now" ? new Date() : clampToSendingWindow(new Date(), sendingWindowFor("CREATOR", settings));

  const seen = new Set<string>();
  const results: { creatorId: string; to: string; status: "scheduled" | "skipped" | "error"; detail?: string }[] = [];

  for (const item of items) {
    const to = String(item.to ?? "").trim().toLowerCase();
    const creatorId = String(item.creatorId ?? "");
    const subject = String(item.subject ?? "").trim();
    const text = String(item.body ?? "").trim();

    if (!EMAIL_RE.test(to)) {
      results.push({ creatorId, to, status: "error", detail: "Missing or invalid email address" });
      continue;
    }
    if (!subject || subject.length > 300 || !text || text.length > 20_000) {
      results.push({ creatorId, to, status: "error", detail: "Subject or body is empty or too long" });
      continue;
    }
    if (seen.has(to)) {
      results.push({ creatorId, to, status: "skipped", detail: "Same address appears twice in this batch" });
      continue;
    }
    seen.add(to);

    const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
    if (!creator) {
      results.push({ creatorId, to, status: "error", detail: "Creator not found" });
      continue;
    }

    const alreadyQueued = await prisma.scheduledInitialEmail.findFirst({
      where: { status: "PENDING", payload: { path: ["contactEmail"], equals: to } },
      select: { id: true },
    });
    if (alreadyQueued) {
      results.push({ creatorId, to, status: "skipped", detail: "Already queued to send" });
      continue;
    }

    const variables = Object.fromEntries(
      CREATOR_VARIABLES.map((key) => [key, String(item.variables?.[key] ?? "").slice(0, 300)])
    ) as Record<string, string>;
    const name = creator.channelName ?? creator.name;

    const result = await scheduleInitialEmail(
      {
        outreachType: "CREATOR",
        recipientType: "DIRECT",
        emailAccountId: account.id,
        contactEmail: to,
        contactName: name,
        creator: { name, channelName: creator.channelName ?? undefined, channelUrl: creator.channelUrl ?? undefined, niche: variables.Niche_Or_Product_Category || undefined },
        variables,
        templateOverrideSubject: subject,
        templateOverrideBody: text,
      },
      scheduledAt
    );

    if (!result.ok) {
      results.push({ creatorId, to, status: "skipped", detail: result.error });
      continue;
    }

    // Keep what the team settled on for next time: the address they used and the highlights text.
    await prisma.creator.update({
      where: { id: creator.id },
      data: {
        ...(!creator.email ? { email: to, emailSource: "Entered by hand" } : {}),
        ...(variables.Content_Highlights ? { contentHighlights: variables.Content_Highlights, contentHighlightsAt: new Date() } : {}),
      },
    });
    results.push({ creatorId, to, status: "scheduled" });
  }

  return NextResponse.json({ results, scheduledAt, fromEmail: account.email });
}
