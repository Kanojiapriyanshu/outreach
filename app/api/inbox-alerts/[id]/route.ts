import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Dismisses one inbox-watch alert (see lib/inboxWatch.ts) — the team has acted on it (replied in
 * Gmail, started tracking it, or decided it doesn't need anything) and it can drop out of both
 * the unread count and the list. Soft — the row stays around, just no longer surfaced. */
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const alert = await prisma.inboxAlert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.inboxAlert.update({ where: { id }, data: { dismissedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
