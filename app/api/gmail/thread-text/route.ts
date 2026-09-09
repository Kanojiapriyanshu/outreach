import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gmailClientFor, getThreadFullText } from "@/lib/gmail";

/**
 * Returns the contact's own most recent message in the thread, so it can be fed straight into
 * the same extractor the "paste an email" flow uses — no need to copy-paste anything by hand
 * when the thread was found via search. Deliberately only the contact's side, and only the
 * latest one: our own outbound text has nothing new to extract (we wrote it), and the extractor
 * is built around a single email — concatenating multiple messages together (even labeled) risks
 * a heuristic like "the line after a sign-off is the company name" bleeding across message
 * boundaries and picking up junk. If they haven't replied yet, there's nothing of theirs to pull
 * from — same as pasting nothing in the manual flow.
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

  return NextResponse.json({ text: latest?.text ?? "" });
}
