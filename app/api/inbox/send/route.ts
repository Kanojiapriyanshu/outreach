import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gmailClientFor, sendRichEmail, type OutgoingAttachment } from "@/lib/gmail";
import { syncInbox } from "@/lib/inboxSync";

export const maxDuration = 60;

/**
 * Serverless request bodies are capped (4.5MB on Vercel), and base64 inflates a file by about a
 * third — so the real ceiling for attachments is a good bit under that. Enforced here with a
 * clear message rather than letting the platform reject the request with an opaque error.
 */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

interface SendBody {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments?: OutgoingAttachment[];
  emailAccountId?: string;
}

function isValidEmailList(value: string): boolean {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));
}

/** Sends a brand-new message (not a reply) from the connected account. */
export async function POST(req: NextRequest) {
  const body: SendBody = await req.json();
  const to = body.to?.trim() ?? "";

  if (!to) return NextResponse.json({ error: "Add at least one recipient" }, { status: 400 });
  if (!isValidEmailList(to)) return NextResponse.json({ error: "That To address doesn't look right" }, { status: 400 });
  if (body.cc?.trim() && !isValidEmailList(body.cc)) {
    return NextResponse.json({ error: "That Cc address doesn't look right" }, { status: 400 });
  }
  if (body.bcc?.trim() && !isValidEmailList(body.bcc)) {
    return NextResponse.json({ error: "That Bcc address doesn't look right" }, { status: 400 });
  }
  if (!body.subject?.trim() && !body.html?.trim()) {
    return NextResponse.json({ error: "Add a subject or a message" }, { status: 400 });
  }

  const attachments = body.attachments ?? [];
  const totalBytes = attachments.reduce((sum, a) => sum + Math.floor((a.data?.length ?? 0) * 0.75), 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `Attachments are too large (${(totalBytes / 1024 / 1024).toFixed(1)}MB). Keep the total under 3MB, or share a link instead.` },
      { status: 413 }
    );
  }

  const account = body.emailAccountId
    ? await prisma.emailAccount.findUnique({ where: { id: body.emailAccountId } })
    : await prisma.emailAccount.findFirst({ where: { accessStatus: "CONNECTED" } });

  if (!account || account.accessStatus !== "CONNECTED") {
    return NextResponse.json({ error: "No connected email account to send from" }, { status: 400 });
  }

  // Suppression applies to anything the system sends, including mail typed by hand — an opt-out
  // has to mean opted out everywhere, not just out of the automated sequences.
  const recipients = to.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const suppressed = await prisma.suppressedContact.findFirst({ where: { email: { in: recipients } } });
  if (suppressed) {
    return NextResponse.json({ error: `${suppressed.email} has opted out and can't be emailed.` }, { status: 400 });
  }

  try {
    const gmail = await gmailClientFor(account.id);
    const sent = await sendRichEmail(gmail, {
      to,
      cc: body.cc?.trim() || undefined,
      bcc: body.bcc?.trim() || undefined,
      subject: body.subject?.trim() || "(no subject)",
      html: body.html || "",
      attachments,
    });

    // Pull the new conversation straight into the mirror so it shows in Sent immediately rather
    // than whenever the next scheduled sync happens to run.
    syncInbox().catch(() => {});

    return NextResponse.json({ ok: true, messageId: sent.id, threadId: sent.threadId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Couldn't send: ${message}` }, { status: 502 });
  }
}
