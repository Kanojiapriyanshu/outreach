import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expiryFromDays, pitchSheetUrl, slugifyLinkName } from "@/lib/pitchSheet";
import { appBaseUrl, uniquePitchToken } from "@/lib/pitchSheetServer";

/**
 * Extend or re-open a link ({ action: "extend", days }), turn it off ({ action: "turn-off" }), take
 * one creator off the sheet ({ action: "remove-item", itemId }) — the brand's link drops them
 * straight away, since it reads the sheet live — or give the link a new name ({ action: "rename",
 * linkName }), which retires the old URL.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { action?: string; days?: number; itemId?: string; linkName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.pitchSheet.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Pitch sheet not found" }, { status: 404 });

  if (body.action === "extend") {
    await prisma.pitchSheet.update({ where: { id }, data: { expiresAt: expiryFromDays(typeof body.days === "number" ? body.days : undefined), revokedAt: null } });
  } else if (body.action === "remove-item") {
    const items = await prisma.pitchSheetItem.findMany({ where: { sheetId: id }, select: { id: true } });
    if (!items.some((i) => i.id === body.itemId)) return NextResponse.json({ error: "That creator isn't on this sheet" }, { status: 404 });
    if (items.length === 1) {
      return NextResponse.json({ error: "This is the last creator on the sheet — turn the link off instead." }, { status: 400 });
    }
    await prisma.pitchSheetItem.delete({ where: { id: body.itemId } });
    // Bump updatedAt so the brand's page shows when the list last changed.
    await prisma.pitchSheet.update({ where: { id }, data: { updatedAt: new Date() } });
  } else if (body.action === "turn-off") {
    await prisma.pitchSheet.update({ where: { id }, data: { revokedAt: new Date() } });
  } else if (body.action === "rename") {
    const name = typeof body.linkName === "string" ? body.linkName : "";
    if (!slugifyLinkName(name)) return NextResponse.json({ error: "Use at least one letter or number in the link name" }, { status: 400 });
    const updated = await prisma.pitchSheet.update({ where: { id }, data: { token: await uniquePitchToken(name) } });
    return NextResponse.json({ ok: true, url: pitchSheetUrl(appBaseUrl(req.nextUrl.origin), updated.token) });
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
