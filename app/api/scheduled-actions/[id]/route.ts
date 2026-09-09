import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderScheduledActionContent } from "@/lib/scheduler";
import { formatDateTime } from "@/lib/formatDate";

async function loadActionWithSequence(id: string) {
  return prisma.scheduledAction.findUnique({
    where: { id },
    include: { sequence: { include: { contact: true } } },
  });
}

/** Preview exactly what this upcoming follow-up/nudge would send right now. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const action = await loadActionWithSequence(id);
  if (!action) return NextResponse.json({ error: "Scheduled action not found" }, { status: 404 });

  const rendered = await renderScheduledActionContent(action, action.sequence);
  if (!rendered) {
    return NextResponse.json({ error: "No template is set up for this step yet" }, { status: 400 });
  }

  return NextResponse.json({
    subject: rendered.subject,
    body: rendered.body,
    isOverridden: rendered.isOverridden,
    step: action.step,
    kind: action.kind,
    scheduledAt: action.scheduledAt,
    status: action.status,
  });
}

interface PatchBody {
  subject?: string;
  body?: string;
  reset?: boolean;
  /** ISO datetime — reschedules this pending action to fire at exactly this moment instead of
   * whenever it was originally set for. Independent of subject/body editing; either can be sent
   * alone or together. */
  scheduledAt?: string;
}

/** Saves (or clears) a direct edit of this specific upcoming send — takes over from auto-render.
 * Also handles rescheduling it to a different date/time, independent of the content edit. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { subject, body, reset, scheduledAt }: PatchBody = await req.json();

  const action = await prisma.scheduledAction.findUnique({ where: { id } });
  if (!action) return NextResponse.json({ error: "Scheduled action not found" }, { status: 404 });
  if (action.status !== "PENDING") {
    return NextResponse.json({ error: "This one has already gone out — nothing left to edit" }, { status: 400 });
  }

  if (scheduledAt) {
    const newDate = new Date(scheduledAt);
    if (isNaN(newDate.getTime())) {
      return NextResponse.json({ error: "That date/time didn't parse — try again" }, { status: 400 });
    }
    await prisma.$transaction([
      prisma.scheduledAction.update({ where: { id }, data: { scheduledAt: newDate } }),
      prisma.activityLog.create({
        data: {
          sequenceId: action.sequenceId,
          eventType: "FOLLOW_UP_SCHEDULED",
          description: `Follow-up #${action.step} rescheduled to ${formatDateTime(newDate)} (picked by hand).`,
        },
      }),
    ]);
    if (!subject && !body && !reset) return NextResponse.json({ ok: true });
  }

  if (reset) {
    await prisma.scheduledAction.update({ where: { id }, data: { subjectOverride: null, bodyOverride: null } });
    return NextResponse.json({ ok: true });
  }

  if (subject || body) {
    if (!subject?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "Subject and body can't be empty" }, { status: 400 });
    }
    await prisma.scheduledAction.update({ where: { id }, data: { subjectOverride: subject, bodyOverride: body } });
  }

  return NextResponse.json({ ok: true });
}
