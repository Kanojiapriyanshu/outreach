import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Gmail-style scheduled-send controls for a not-yet-arrived Email 1:
 *  - PENDING  -> DELETE cancels it (worker only ever picks up PENDING rows, so flipping the
 *                status is enough to stop it going out; the row stays around in History).
 *  - anything else (CANCELLED/FAILED/SENT) -> DELETE has nothing left to cancel, so it removes
 *                the row for good instead — the "Delete" action on a History row.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const scheduled = await prisma.scheduledInitialEmail.findUnique({ where: { id } });
  if (!scheduled) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (scheduled.status === "PENDING") {
    await prisma.scheduledInitialEmail.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true, cancelled: true });
  }

  await prisma.scheduledInitialEmail.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
}

interface PatchBody {
  /** ISO datetime to (re)schedule this Email 1 for. Works on a PENDING row (just moves the time)
   * as well as a CANCELLED or FAILED one — reopening it as PENDING is exactly "reschedule a
   * cancelled send", the Gmail-style flow this endpoint exists for. */
  scheduledAt?: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { scheduledAt }: PatchBody = await req.json();

  const scheduled = await prisma.scheduledInitialEmail.findUnique({ where: { id } });
  if (!scheduled) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scheduled.status === "SENT") {
    return NextResponse.json({ error: "This one has already gone out — nothing left to reschedule" }, { status: 400 });
  }
  if (!scheduledAt) return NextResponse.json({ error: "Pick a date and time" }, { status: 400 });

  const newDate = new Date(scheduledAt);
  if (isNaN(newDate.getTime())) {
    return NextResponse.json({ error: "That date/time didn't parse — try again" }, { status: 400 });
  }

  await prisma.scheduledInitialEmail.update({
    where: { id },
    data: { scheduledAt: newDate, status: "PENDING", error: null },
  });
  return NextResponse.json({ ok: true });
}
