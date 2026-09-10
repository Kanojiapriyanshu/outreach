import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Cancels a not-yet-sent scheduled Email 1 — the worker's due-query only ever picks up PENDING
 * rows, so flipping this to CANCELLED is enough to stop it going out. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const scheduled = await prisma.scheduledInitialEmail.findUnique({ where: { id } });
  if (!scheduled) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scheduled.status !== "PENDING") {
    return NextResponse.json({ error: "This one has already gone out (or been cancelled) — nothing left to cancel" }, { status: 400 });
  }

  await prisma.scheduledInitialEmail.update({ where: { id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ ok: true });
}
