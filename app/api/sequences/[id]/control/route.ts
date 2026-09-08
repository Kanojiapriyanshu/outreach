import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { advanceState, type SequenceState } from "@/lib/stateMachine";
import { processScheduledAction, computeNextScheduledAt, MANUAL_OR_TERMINAL_STAGES } from "@/lib/scheduler";

type ControlAction = "PAUSE" | "RESUME" | "STOP" | "SKIP" | "SEND_NOW";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action }: { action: ControlAction } = await req.json();

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  const pendingAction = await prisma.scheduledAction.findFirst({
    where: { sequenceId: id, status: "PENDING" },
    orderBy: { step: "asc" },
  });

  switch (action) {
    case "PAUSE": {
      await prisma.outreachSequence.update({ where: { id }, data: { status: "PAUSED" } });
      await prisma.activityLog.create({
        data: { sequenceId: id, eventType: "SEQUENCE_PAUSED", description: "Paused — no follow-ups will go out until resumed." },
      });
      return NextResponse.json({ ok: true });
    }
    case "RESUME": {
      if (sequence.status !== "PAUSED") {
        return NextResponse.json({ error: "Sequence is not paused" }, { status: 400 });
      }
      const state: SequenceState = { status: "PAUSED", currentStep: sequence.currentStep };
      const next = advanceState(state, "RESUME");
      await prisma.outreachSequence.update({ where: { id }, data: { status: next.status } });
      await prisma.activityLog.create({
        data: { sequenceId: id, eventType: "SEQUENCE_RESUMED", description: "Resumed — follow-ups will go out again as scheduled." },
      });
      return NextResponse.json({ ok: true });
    }
    case "STOP": {
      await prisma.$transaction([
        prisma.outreachSequence.update({ where: { id }, data: { status: "STOPPED" } }),
        prisma.scheduledAction.updateMany({
          where: { sequenceId: id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: { sequenceId: id, eventType: "SEQUENCE_STOPPED", description: "Stopped for good — no more follow-ups will be sent." },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }
    case "SKIP": {
      if (!pendingAction) return NextResponse.json({ error: "No pending follow-up to skip" }, { status: 400 });

      const state: SequenceState = { status: sequence.status as SequenceState["status"], currentStep: sequence.currentStep };
      const next = advanceState(state, "NO_REPLY_ADVANCE");

      await prisma.$transaction([
        prisma.scheduledAction.update({ where: { id: pendingAction.id }, data: { status: "SKIPPED" } }),
        prisma.outreachSequence.update({
          where: { id },
          data: {
            status: next.status,
            currentStep: next.currentStep,
            ...(next.status === "COMPLETED" && !MANUAL_OR_TERMINAL_STAGES.includes(sequence.stage)
              ? { stage: "NOT_INTERESTED" as const }
              : {}),
          },
        }),
        prisma.activityLog.create({
          data: { sequenceId: id, eventType: "FOLLOW_UP_SKIPPED", description: `Skipped follow-up #${pendingAction.step}.` },
        }),
      ]);

      if (next.status !== "COMPLETED") {
        const settings = await prisma.automationSettings.findFirstOrThrow();
        // Index by the step being scheduled (next.currentStep + 1), not the one just skipped —
        // see the same note in lib/scheduler.ts's processScheduledAction.
        const scheduledAt = computeNextScheduledAt(sequence.outreachType, next.currentStep + 1, settings);

        await prisma.scheduledAction.create({
          data: {
            sequenceId: id,
            step: next.currentStep + 1,
            scheduledAt,
            status: "PENDING",
            kind: pendingAction.kind,
            templateVersion: pendingAction.templateVersion,
            actionKey: `${id}-step-${next.currentStep + 1}-${pendingAction.kind}-${Date.now()}`,
          },
        });
      }
      return NextResponse.json({ ok: true });
    }
    case "SEND_NOW": {
      if (!pendingAction) return NextResponse.json({ error: "No pending follow-up to send" }, { status: 400 });
      const result = await processScheduledAction(pendingAction.id, { ignoreSendingWindow: true });
      return NextResponse.json({ ok: true, result });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
