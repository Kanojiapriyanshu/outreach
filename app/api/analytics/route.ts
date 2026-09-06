import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function metricsFor(outreachType: "BRAND" | "CREATOR") {
  const sequences = await prisma.outreachSequence.findMany({ where: { outreachType } });
  const total = sequences.length;
  const replied = sequences.filter((s) => s.status === "REPLIED").length;
  const completed = sequences.filter((s) => s.status === "COMPLETED").length;
  const bounced = sequences.filter((s) => s.status === "BOUNCED").length;

  // Replies-by-follow-up: for each sequence that ended in REPLIED, currentStep tells us
  // which follow-up (0-3) had most recently been sent when the reply arrived.
  const repliedSeqs = sequences.filter((s) => s.status === "REPLIED");
  const followUp1Replies = repliedSeqs.filter((s) => s.currentStep === 1).length;
  const followUp2Replies = repliedSeqs.filter((s) => s.currentStep === 2).length;
  const followUp3Replies = repliedSeqs.filter((s) => s.currentStep === 3).length;
  const initialReplies = repliedSeqs.filter((s) => s.currentStep === 0).length;

  return {
    total,
    replied,
    replyRate: total > 0 ? replied / total : 0,
    initialReplies,
    followUp1Replies,
    followUp2Replies,
    followUp3Replies,
    completed,
    bounced,
  };
}

export async function GET() {
  const [brand, creator] = await Promise.all([metricsFor("BRAND"), metricsFor("CREATOR")]);
  return NextResponse.json({ brand, creator });
}
