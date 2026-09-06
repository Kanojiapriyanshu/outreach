import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PipelineStage } from "@/app/generated/prisma/client";

// The team sets these manually from the dashboard — email text alone can't reliably tell you a
// creator was internally selected, that real back-and-forth negotiation started, or that a deal
// closed. (FIRST_EMAIL_SENT, CREATOR_LIST_SENT and NOT_INTERESTED are set automatically instead.)
const MANUALLY_SETTABLE_STAGES: PipelineStage[] = ["NEGOTIATION", "CREATOR_SELECTED", "DEAL"];

const STAGE_LABEL: Record<string, string> = {
  NEGOTIATION: "Negotiation",
  CREATOR_SELECTED: "Creator Selected",
  DEAL: "Deal",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { stage }: { stage: string } = await req.json();

  if (!MANUALLY_SETTABLE_STAGES.includes(stage as PipelineStage)) {
    return NextResponse.json({ error: "That stage can't be set manually" }, { status: 400 });
  }
  const newStage = stage as PipelineStage;

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.outreachSequence.update({ where: { id }, data: { stage: newStage } }),
    prisma.activityLog.create({
      data: { sequenceId: id, eventType: "STAGE_CHANGED", description: `Stage set to ${STAGE_LABEL[stage]}.` },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
