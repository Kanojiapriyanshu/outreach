import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gmailClientFor, getThreadFullText } from "@/lib/gmail";

/**
 * Returns the contact's own most recent message in the thread, so it can be fed straight into
 * the same extractor the "paste an email" flow uses — no need to copy-paste anything by hand
 * when the thread was found via search. Deliberately only the contact's side, and only the
 * latest one: the extractor is built around a single email, and concatenating multiple messages
 * together (even labeled) risks a heuristic like "the line after a sign-off is the company name"
 * bleeding across message boundaries and picking up junk.
 *
 * If they haven't replied yet — the common case right after attaching a just-sent Email 1 — falls
 * back to that first message instead (`isOutbound: true`): it's an email WE wrote, but one that
 * usually still names who it's for ("Hello SABALA Team,"), which is genuinely new information the
 * system hasn't seen before now. The extractor is told which case this is so it doesn't
 * misattribute our own identity (from a self-introduction like "This is Yash from Fidem Growth")
 * as theirs.
 */
export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");
  const emailAccountId = req.nextUrl.searchParams.get("emailAccountId");
  if (!threadId || !emailAccountId) {
    return NextResponse.json({ error: "Missing threadId or emailAccountId" }, { status: 400 });
  }

  const account = await prisma.emailAccount.findUnique({ where: { id: emailAccountId } });
  if (!account || account.accessStatus !== "CONNECTED") {
    return NextResponse.json({ error: "No connected email account" }, { status: 400 });
  }

  const gmail = await gmailClientFor(emailAccountId);
  const messages = await getThreadFullText(gmail, threadId);

  const theirMessages = messages.filter((m) => !m.from.toLowerCase().includes(account.email.toLowerCase()));
  const latest = theirMessages[theirMessages.length - 1];
  if (latest) return NextResponse.json({ text: latest.text, isOutbound: false });

  // No reply yet — fall back to the very first message (Email 1), not our latest outbound one:
  // a follow-up nudge ("just checking in...") rarely re-states the recipient's name the way the
  // original greeting does.
  const first = messages[0];
  return NextResponse.json({ text: first?.text ?? "", isOutbound: true });
}
