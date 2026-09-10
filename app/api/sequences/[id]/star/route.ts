import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Gmail-style star toggle — purely a manual flag, doesn't affect pipeline stage, status, or
 * anything the automation does. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { important }: { important: boolean } = await req.json();

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.outreachSequence.update({ where: { id }, data: { isImportant: important } }),
    prisma.activityLog.create({
      data: {
        sequenceId: id,
        eventType: important ? "MARKED_IMPORTANT" : "UNMARKED_IMPORTANT",
        description: important ? "Marked as important." : "Unmarked as important.",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
