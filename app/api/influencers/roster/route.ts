import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Shows or hides one creator on the public roster page ({ creatorId, hidden }). */
export async function PATCH(req: NextRequest) {
  let body: { creatorId?: unknown; hidden?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof body.creatorId !== "string" || typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const updated = await prisma.creator.updateMany({ where: { id: body.creatorId }, data: { rosterHidden: body.hidden } });
  if (updated.count === 0) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
