import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gmailClientFor, sendRichEmail, getRfc822MessageId, modifyThreadLabels, type OutgoingAttachment } from "@/lib/gmail";
import { refreshThread } from "@/lib/inboxSync";
import { computeNextScheduledAt } from "@/lib/scheduler";
import { formatDateTime } from "@/lib/formatDate";

export const maxDuration = 60;

/** Mirrors the cap in /api/inbox/send — see the note there on serverless body limits. */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** What should happen to automation after a human replies by hand. */
type FollowUpChoice =
  /** Treat the reply like a fresh outbound: if they go quiet, nudge on the usual cadence. */
  | "auto"
  /** The conversation is being handled personally from here — no automated chasing. */
  | "none";

interface ReplyBody {
  /** HTML body from the rich-text composer. */
  html: string;
  cc?: string;
  bcc?: string;
  attachments?: OutgoingAttachment[];
  followUp?: FollowUpChoice;
}

function isValidEmailList(value: string): boolean {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));
}

/** Flattens the composed HTML for the activity record, which stores plain text. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sends a reply into an existing conversation and then decides what automation should do next.
 *
 * That second half is the point. A reply typed by hand is a real pipeline event, not just an
 * email: the follow-ups queued against the *previous* message are now stale (they'd chase someone
 * about something already superseded), and whether this conversation still needs automated
 * chasing is a judgment only the person writing it can make. So replying always clears the stale
 * queue, and the caller says which of the two sane outcomes they want — resume chasing on the
 * normal cadence if the other side goes quiet, or hand the thread over to a human entirely.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { html, cc, bcc, attachments = [], followUp = "auto" }: ReplyBody = await req.json();

  const bodyText = htmlToText(html ?? "");
  if (!bodyText && attachments.length === 0) {
    return NextResponse.json({ error: "Write something before sending" }, { status: 400 });
  }
  if (cc?.trim() && !isValidEmailList(cc)) {
    return NextResponse.json({ error: "That Cc address doesn't look right" }, { status: 400 });
  }
  if (bcc?.trim() && !isValidEmailList(bcc)) {
    return NextResponse.json({ error: "That Bcc address doesn't look right" }, { status: 400 });
  }

  const totalBytes = attachments.reduce((sum, a) => sum + Math.floor((a.data?.length ?? 0) * 0.75), 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `Attachments are too large (${(totalBytes / 1024 / 1024).toFixed(1)}MB). Keep the total under 3MB, or share a link instead.` },
      { status: 413 }
    );
  }

  const thread = await prisma.inboxThread.findUnique({
    where: { id },
    include: { messages: { orderBy: { sentAt: "asc" } }, emailAccount: true },
  });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (thread.messages.length === 0) {
    return NextResponse.json({ error: "Nothing to reply to in this conversation yet" }, { status: 400 });
  }

  // Reply to whoever last wrote in — falling back to the thread's counterpart if every message
  // here is one of ours (a thread we started and they haven't answered).
  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === "IN");
  const target = lastInbound ?? thread.messages[thread.messages.length - 1];
  const to = lastInbound ? lastInbound.fromAddress : thread.fromAddress;
  const subject = thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`;

  let sent: { id: string; threadId: string };
  try {
    const gmail = await gmailClientFor(thread.emailAccountId);
    const { messageId: rfc822MessageId, references } = await getRfc822MessageId(gmail, target.gmailMessageId);

    sent = await sendRichEmail(gmail, {
      threadId: thread.gmailThreadId,
      to,
      cc: cc?.trim() || undefined,
      bcc: bcc?.trim() || undefined,
      subject,
      html: html ?? "",
      attachments,
      inReplyToMessageId: rfc822MessageId,
      references,
    });

    // Replying obviously means it's been read.
    await modifyThreadLabels(gmail, thread.gmailThreadId, { remove: ["UNREAD"] }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Couldn't send: ${message}` }, { status: 502 });
  }

  await prisma.inboxThread.update({ where: { id }, data: { isUnread: false } });
  await refreshThread(id).catch(() => {});

  // --- Automation handoff, for conversations the CRM is actually running a sequence on ---
  let followUpResult: { action: FollowUpChoice; scheduledAt?: Date } = { action: followUp };

  if (thread.sequenceId) {
    const seq = await prisma.outreachSequence.findUnique({ where: { id: thread.sequenceId } });
    if (seq && !seq.deletedAt) {
      // Whatever was queued was aimed at the state of the thread *before* this reply — always
      // stale now, regardless of which choice was made.
      await prisma.scheduledAction.updateMany({
        where: { sequenceId: seq.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });

      await prisma.emailMessage.create({
        data: {
          sequenceId: seq.id,
          providerMessageId: sent.id,
          direction: "OUT",
          source: "MANUAL",
          subject,
          body: bodyText,
          sentAt: new Date(),
          status: "SENT",
        },
      });

      if (followUp === "auto") {
        const settings = await prisma.automationSettings.findFirstOrThrow();
        const scheduledAt = computeNextScheduledAt(seq.outreachType, 1, settings);
        await prisma.outreachSequence.update({
          where: { id: seq.id },
          data: { status: "WAITING_FOR_REPLY", currentStep: 0, creatorListResponseAt: null },
        });
        await prisma.scheduledAction.create({
          data: {
            sequenceId: seq.id,
            step: 1,
            scheduledAt,
            status: "PENDING",
            kind: "CREATOR_LIST_NUDGE",
            actionKey: `${seq.id}-reply-${sent.id}`,
          },
        });
        await prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "FOLLOW_UP_SCHEDULED",
            description: `Replied by hand from the inbox. If there's no answer, the next nudge goes out ${formatDateTime(scheduledAt)}.`,
          },
        });
        followUpResult = { action: "auto", scheduledAt };
      } else {
        await prisma.outreachSequence.update({
          where: { id: seq.id },
          data: { status: "STOPPED" },
        });
        await prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "SEQUENCE_STOPPED",
            description: "Replied by hand from the inbox and turned off automated follow-ups — this one's being handled personally.",
          },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, followUp: followUpResult });
}
