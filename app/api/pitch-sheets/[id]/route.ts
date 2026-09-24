import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expiryFromDays } from "@/lib/pitchSheet";

/** Extend or re-open a link ({ action: "extend", days }), or turn it off ({ action: "turn-off" }). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { action?: string; days?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.pitchSheet.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Pitch sheet not found" }, { status: 404 });

  if (body.action === "extend") {
    await prisma.pitchSheet.update({ where: { id }, data: { expiresAt: expiryFromDays(typeof body.days === "number" ? body.days : undefined), revokedAt: null } });
  } else if (body.action === "turn-off") {
    await prisma.pitchSheet.update({ where: { id }, data: { revokedAt: new Date() } });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.pitchSheet.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
