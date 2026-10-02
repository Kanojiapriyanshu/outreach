/**
 * Replying into an existing conversation — one implementation behind every place a reply can be
 * written: the inbox, the reply panel on the Brand / Influencer outreach pages, and a reply that
 * was scheduled for later (lib/trackSequence.ts). Keeping it in one place is what keeps the cards
 * honest: wherever the reply is sent from, the same things happen to the thread's pipeline state.
 *
 * No "server-only" import: the standalone worker (scripts/worker.ts) reaches this through
 * scheduled replies.
 */
import { prisma } from "@/lib/prisma";
import { gmailClientFor, sendRichEmail, getRfc822MessageId, modifyThreadLabels, type OutgoingAttachment } from "@/lib/gmail";
import { refreshThread } from "@/lib/inboxSync";
import { isTrackingNotification } from "@/lib/trackingSenders";
import { computeNextScheduledAt } from "@/lib/scheduler";
import { formatDateTime } from "@/lib/formatDate";
import { stageAfterReply, type ReplyStageChoice } from "@/lib/stateMachine";
import { mentionsRosterLink, sharesCreators } from "@/lib/sharedLinks";

/** What should happen to automation after a human replies by hand. */
export type FollowUpChoice =
  /** Treat the reply like a fresh outbound: if they go quiet, nudge on the usual cadence. */
  | "auto"
  /** The conversation is being handled personally from here — no automated chasing. */
  | "none";

export type { ReplyStageChoice };

export interface ThreadReplyInput {
  /** HTML body from the rich-text composer. */
  html: string;
  cc?: string;
  bcc?: string;
  attachments?: OutgoingAttachment[];
  followUp?: FollowUpChoice;
  stage?: ReplyStageChoice;
}

export type ThreadReplyResult =
  | { ok: true; sequenceId: string | null; followUp: { action: FollowUpChoice; scheduledAt?: Date }; stageMovedTo: string | null }
  | { ok: false; status: number; error: string };

/** Flattens the composed HTML for the activity record, which stores plain text. */
export function htmlToText(html: string): string {
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
 * Who a reply in this conversation goes to and which message it threads onto.
 *
 * Reply to whoever last wrote in — falling back to the thread's counterpart if every message here
 * is one of ours (a thread we started and they haven't answered). Tracking notifications are
 * excluded explicitly rather than relying on the sync filter alone: a read-receipt robot's mail
 * threads into the real conversation, and picking it as "the last inbound" would address the reply
 * to the robot instead of the person.
 */
export async function replyTarget(inboxThreadId: string) {
  const thread = await prisma.inboxThread.findUnique({
    where: { id: inboxThreadId },
    include: { messages: { orderBy: { sentAt: "asc" } }, emailAccount: true },
  });
  if (!thread) return { ok: false as const, status: 404, error: "Not found" };
  if (thread.messages.length === 0) return { ok: false as const, status: 400, error: "Nothing to reply to in this conversation yet" };

  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === "IN" && !isTrackingNotification(m.fromAddress));
  const realMessages = thread.messages.filter((m) => !isTrackingNotification(m.fromAddress));
  const target = lastInbound ?? realMessages[realMessages.length - 1] ?? thread.messages[thread.messages.length - 1];
  const to = lastInbound ? lastInbound.fromAddress : thread.fromAddress;
  const subject = thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`;
  return { ok: true as const, thread, target, to, subject };
}

/**
 * Sends a reply into an existing conversation and then decides what automation should do next.
 *
 * That second half is the point. A reply typed by hand is a real pipeline event, not just an email:
 * the follow-ups queued against the *previous* message are now stale (they'd chase someone about
 * something already superseded), the thread no longer needs the team's answer, and whether it still
 * needs automated chasing is a judgment only the person writing can make. So replying always clears
 * the stale queue and the "needs your reply" flag, and the caller says which of the two sane
 * outcomes they want — resume chasing on the normal cadence if the other side goes quiet, or hand
 * the thread over to a human entirely.
 */
export async function sendThreadReply(inboxThreadId: string, input: ThreadReplyInput): Promise<ThreadReplyResult> {
  const { html, cc, bcc, attachments = [], followUp = "auto", stage = "auto" } = input;
  const bodyText = htmlToText(html ?? "");
  if (!bodyText && attachments.length === 0) return { ok: false, status: 400, error: "Write something before sending" };

  const found = await replyTarget(inboxThreadId);
  if (!found.ok) return found;
  const { thread, target, to, subject } = found;

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
    return { ok: false, status: 502, error: `Couldn't send: ${message}` };
  }

  await prisma.inboxThread.update({ where: { id: inboxThreadId }, data: { isUnread: false } });
  await refreshThread(inboxThreadId).catch(() => {});

  // --- Automation handoff, for conversations the CRM is actually running a sequence on ---
  let followUpResult: { action: FollowUpChoice; scheduledAt?: Date } = { action: followUp };
  let stageMovedTo: string | null = null;

  const seq = thread.sequenceId ? await prisma.outreachSequence.findUnique({ where: { id: thread.sequenceId } }) : null;
  if (seq && !seq.deletedAt) {
    // Whatever was queued was aimed at the state of the thread *before* this reply — always stale
    // now, regardless of which choice was made.
    await prisma.scheduledAction.updateMany({ where: { sequenceId: seq.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await prisma.emailMessage.create({
      data: { sequenceId: seq.id, providerMessageId: sent.id, direction: "OUT", source: "MANUAL", subject, body: bodyText, sentAt: new Date(), status: "SENT" },
    });

    // A reply that carries the roster link or a pitch-sheet link puts creators in front of the
    // brand, whatever the caller ticked — and the roster going out is recorded on the thread.
    const newStage = stageAfterReply(seq.outreachType, seq.stage, stage === "auto" && sharesCreators(html) ? "list-sent" : stage);
    stageMovedTo = newStage;
    if (seq.outreachType === "BRAND" && !seq.rosterSentAt && mentionsRosterLink(html)) {
      await prisma.$transaction([
        prisma.outreachSequence.update({ where: { id: seq.id }, data: { rosterSentAt: new Date() } }),
        prisma.activityLog.create({ data: { sequenceId: seq.id, eventType: "STAGE_CHANGED", description: "Roster shared — the reply included the public roster link." } }),
      ]);
    }

    if (followUp === "auto") {
      const settings = await prisma.automationSettings.findFirstOrThrow();
      const scheduledAt = computeNextScheduledAt(seq.outreachType, 1, settings);
      await prisma.outreachSequence.update({
        where: { id: seq.id },
        data: {
          status: "WAITING_FOR_REPLY",
          currentStep: 0,
          creatorListResponseAt: null,
          awaitingResponseSince: null,
          ...(newStage ? { stage: newStage } : {}),
        },
      });
      await prisma.scheduledAction.create({
        data: {
          sequenceId: seq.id,
          step: 1,
          scheduledAt,
          status: "PENDING",
          // An influencer gets a check-in about the collaboration — the creator-list nudge is
          // brand copy and would read as a mistake to them.
          kind: seq.outreachType === "CREATOR" ? "CREATOR_NUDGE" : "CREATOR_LIST_NUDGE",
          actionKey: `${seq.id}-reply-${sent.id}`,
        },
      });
      await prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "FOLLOW_UP_SCHEDULED",
          description: `Replied by hand from the CRM. If there's no answer, the next nudge goes out ${formatDateTime(scheduledAt)}.`,
        },
      });
      followUpResult = { action: "auto", scheduledAt };
    } else {
      await prisma.outreachSequence.update({
        where: { id: seq.id },
        data: { status: "STOPPED", awaitingResponseSince: null, ...(newStage ? { stage: newStage } : {}) },
      });
      await prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "SEQUENCE_STOPPED",
          description: "Replied by hand from the CRM and turned off automated follow-ups — this one's being handled personally.",
        },
      });
    }

    if (newStage) {
      await prisma.activityLog.create({
        data: { sequenceId: seq.id, eventType: "STAGE_CHANGED", description: "Stage set to Creator List Sent." },
      });
    }
  }

  return { ok: true, sequenceId: seq?.id ?? null, followUp: followUpResult, stageMovedTo };
}
