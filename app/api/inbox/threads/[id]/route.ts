import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gmailClientFor, modifyThreadLabels } from "@/lib/gmail";
import { loadThreadWithBodies } from "@/lib/inboxSync";

/** Opens a conversation — bodies are fetched from Gmail and cached on first read. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const thread = await loadThreadWithBodies(id);
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      isUnread: thread.isUnread,
      isStarred: thread.isStarred,
      isArchived: thread.isArchived,
      gmailThreadId: thread.gmailThreadId,
      sequenceId: thread.sequenceId,
      accountEmail: thread.emailAccount.email,
      messages: thread.messages.map((m) => ({
        id: m.id,
        fromName: m.fromName,
        fromAddress: m.fromAddress,
        toAddresses: m.toAddresses,
        ccAddresses: m.ccAddresses,
        subject: m.subject,
        snippet: m.snippet,
        bodyText: m.bodyText,
        bodyHtml: m.bodyHtml,
        direction: m.direction,
        sentAt: m.sentAt,
      })),
    },
  });
}

interface PatchBody {
  isUnread?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
}

/**
 * Thread state changes, written to Gmail as well as locally — marking something read here marks
 * it read in the real mailbox, archiving archives it, starring stars it. That two-way behavior is
 * the whole point: this has to be the inbox, not a second place to also keep track of things.
 *
 * The local write happens even if the Gmail write fails (an account authorized before the
 * gmail.modify scope was added can still read and send, just not relabel), so the app stays
 * usable and simply falls out of sync on that one flag until the account is reconnected.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: PatchBody = await req.json();

  const thread = await prisma.inboxThread.findUnique({ where: { id } });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const add: string[] = [];
  const remove: string[] = [];
  if (body.isUnread === true) add.push("UNREAD");
  if (body.isUnread === false) remove.push("UNREAD");
  if (body.isStarred === true) add.push("STARRED");
  if (body.isStarred === false) remove.push("STARRED");
  if (body.isArchived === true) remove.push("INBOX");
  if (body.isArchived === false) add.push("INBOX");
  if (body.isTrashed === true) add.push("TRASH");
  if (body.isTrashed === false) remove.push("TRASH");

  let syncedToGmail = true;
  if (add.length > 0 || remove.length > 0) {
    try {
      const gmail = await gmailClientFor(thread.emailAccountId);
      await modifyThreadLabels(gmail, thread.gmailThreadId, { add, remove });
    } catch (err) {
      console.error(`[inbox] couldn't apply labels to ${thread.gmailThreadId}:`, err);
      syncedToGmail = false;
    }
  }

  await prisma.inboxThread.update({
    where: { id },
    data: {
      ...(body.isUnread !== undefined ? { isUnread: body.isUnread } : {}),
      ...(body.isStarred !== undefined ? { isStarred: body.isStarred } : {}),
      ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
      ...(body.isTrashed !== undefined ? { isTrashed: body.isTrashed } : {}),
    },
  });

  return NextResponse.json({ ok: true, syncedToGmail });
}
