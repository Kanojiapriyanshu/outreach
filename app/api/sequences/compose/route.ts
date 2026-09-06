import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { composeAndSendInitialEmail, type ComposeEmailInput } from "@/lib/trackSequence";

export async function POST(req: NextRequest) {
  const body: ComposeEmailInput = await req.json();

  if (!body.outreachType || !body.emailAccountId || !body.contactEmail || !body.contactName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await composeAndSendInitialEmail(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const sequence = await prisma.outreachSequence.findUnique({ where: { id: result.sequenceId } });
  return NextResponse.json({ sequence });
}
