import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackSequence, type TrackEmailInput } from "@/lib/trackSequence";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type"); // BRAND | CREATOR | null (=all)

  const sequences = await prisma.outreachSequence.findMany({
    where: type ? { outreachType: type as "BRAND" | "CREATOR" } : undefined,
    include: {
      contact: { include: { brand: true, creator: true } },
      scheduledActions: { orderBy: { step: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ sequences });
}

export async function POST(req: NextRequest) {
  const body: TrackEmailInput = await req.json();
  const result = await trackSequence(body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const sequence = await prisma.outreachSequence.findUnique({ where: { id: result.sequenceId } });
  return NextResponse.json({ sequence, duplicate: result.duplicate });
}
