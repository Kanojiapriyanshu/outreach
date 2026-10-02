import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OutgoingAttachment } from "@/lib/gmail";
import { htmlToText, replyTarget, sendThreadReply, type FollowUpChoice, type ReplyStageChoice } from "@/lib/threadReply";
import { schedulePlainEmail } from "@/lib/trackSequence";
import { formatDateTime } from "@/lib/formatDate";

export const maxDuration = 60;

/** Mirrors the cap in /api/inbox/send — see the note there on serverless body limits. */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

interface ReplyBody {
  /** HTML body from the rich-text composer. */
  html: string;
  cc?: string;
  bcc?: string;
  attachments?: OutgoingAttachment[];
  followUp?: FollowUpChoice;
  stage?: ReplyStageChoice;
  /** Send later instead of now — Gmail-style schedule send, into the same conversation. */
  scheduledAt?: string;
}

function isValidEmailList(value: string): boolean {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));
}

/**
 * Replies into an existing conversation — now, or at a chosen time. Used by the inbox and by the
 * reply panel on the Brand / Influencer outreach pages; what happens to the thread's pipeline state
 * afterwards lives in lib/threadReply.ts so every entry point behaves the same.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { html, cc, bcc, attachments = [], followUp = "auto", stage = "auto", scheduledAt: scheduledAtRaw }: ReplyBody = await req.json();

  if (!htmlToText(html ?? "") && attachments.length === 0) {
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

  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now() + 60_000) {
    const found = await replyTarget(id);
    if (!found.ok) return NextResponse.json({ error: found.error }, { status: found.status });

    const result = await schedulePlainEmail(
      {
        emailAccountId: found.thread.emailAccountId,
        to: found.to,
        cc: cc?.trim() || undefined,
        bcc: bcc?.trim() || undefined,
        subject: found.subject,
        html: html ?? "",
        attachments,
        reply: { inboxThreadId: id, sequenceId: found.thread.sequenceId, followUp, stage },
      },
      scheduledAt
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    // The answer is written and queued, so the thread no longer needs the team's attention.
    if (found.thread.sequenceId) {
      await prisma.$transaction([
        prisma.outreachSequence.update({ where: { id: found.thread.sequenceId }, data: { awaitingResponseSince: null } }),
        prisma.activityLog.create({
          data: {
            sequenceId: found.thread.sequenceId,
            eventType: "REPLY_HANDLED",
            description: `Reply written and scheduled to send ${formatDateTime(result.scheduledAt)}.`,
          },
        }),
      ]);
    }
    return NextResponse.json({ ok: true, scheduled: true, scheduledAt: result.scheduledAt });
  }

  const result = await sendThreadReply(id, { html, cc, bcc, attachments, followUp, stage });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, followUp: result.followUp, stageMovedTo: result.stageMovedTo });
}
