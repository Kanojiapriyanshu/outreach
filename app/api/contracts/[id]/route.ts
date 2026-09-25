import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeContract } from "@/lib/contracts/template";

const STATUSES = new Set(["DRAFT", "SENT", "SIGNED", "VOID"]);
const STATUS_VERSION_LABEL: Record<string, string> = { SENT: "Sent to brand", SIGNED: "Signed" };

/**
 * Save the editor ({ title?, data? }) — called on every pause in typing — or move the contract
 * along ({ status }). Marking it sent or signed also freezes a version, so later edits can be
 * compared with exactly what the brand saw.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { title?: string; data?: unknown; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = await prisma.contract.findUnique({ where: { id }, select: { id: true, data: true } });
  if (!existing) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const update: { title?: string; data?: object; status?: string; sentAt?: Date; signedAt?: Date } = {};
  if (typeof body.title === "string") update.title = body.title.trim().slice(0, 200) || "Untitled agreement";
  if (body.data !== undefined) update.data = JSON.parse(JSON.stringify(normalizeContract(body.data)));
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    update.status = body.status;
    if (body.status === "SENT") update.sentAt = new Date();
    if (body.status === "SIGNED") update.signedAt = new Date();
  }

  const contract = await prisma.contract.update({ where: { id }, data: update });

  let version = null;
  if (body.status && STATUS_VERSION_LABEL[body.status]) {
    version = await prisma.contractVersion.create({
      data: { contractId: id, label: STATUS_VERSION_LABEL[body.status], data: contract.data ?? existing.data ?? {} },
      select: { id: true, label: true, createdAt: true, data: true },
    });
  }

  return NextResponse.json({ ok: true, status: contract.status, updatedAt: contract.updatedAt.toISOString(), version });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.contract.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
