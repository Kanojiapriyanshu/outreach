import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stageLabelText } from "@/app/components/Badge";
import type { PipelineStage } from "@/app/generated/prisma/client";

// The team sets these manually from the dashboard — email text alone can't reliably tell you a
// creator was internally selected, that real back-and-forth negotiation started, or that a deal
// closed. (FIRST_EMAIL_SENT, CREATOR_LIST_SENT and NOT_INTERESTED are set automatically instead.)
// Influencer threads also allow correcting what the reply reader decided (Interested / Rate
// Received) and closing a creator out as Not Interested after a call or DM it never saw.
const MANUALLY_SETTABLE_STAGES: Record<"BRAND" | "CREATOR", PipelineStage[]> = {
  BRAND: ["NEGOTIATION", "CREATOR_SELECTED", "DEAL"],
  CREATOR: ["INTERESTED", "RATE_RECEIVED", "NEGOTIATION", "CREATOR_SELECTED", "DEAL", "NOT_INTERESTED"],
};

// Closing an influencer thread must also stop anything still queued — the watcher ignores these
// stages, but a follow-up that was already scheduled would otherwise still go out.
const CLOSING_STAGES: PipelineStage[] = ["DEAL", "NOT_INTERESTED"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { stage }: { stage: string } = await req.json();

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  if (!MANUALLY_SETTABLE_STAGES[sequence.outreachType].includes(stage as PipelineStage)) {
    return NextResponse.json({ error: "That stage can't be set manually" }, { status: 400 });
  }
  const newStage = stage as PipelineStage;
  const closesInfluencer = sequence.outreachType === "CREATOR" && CLOSING_STAGES.includes(newStage);

  await prisma.$transaction([
    prisma.outreachSequence.update({
      where: { id },
      data: { stage: newStage, ...(closesInfluencer ? { awaitingResponseSince: null } : {}) },
    }),
    ...(closesInfluencer
      ? [prisma.scheduledAction.updateMany({ where: { sequenceId: id, status: "PENDING" }, data: { status: "CANCELLED" } })]
      : []),
    prisma.activityLog.create({
      data: {
        sequenceId: id,
        eventType: "STAGE_CHANGED",
        description: closesInfluencer
          ? `Stage set to ${stageLabelText(newStage)} — any scheduled follow-ups were cancelled.`
          : `Stage set to ${stageLabelText(newStage)}.`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
