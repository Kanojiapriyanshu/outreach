import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Freeze the contract as it is now ({ label }) — e.g. before trying out a brand's redlines. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { label?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Label is optional.
  }
  const contract = await prisma.contract.findUnique({ where: { id }, select: { data: true } });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : "Saved version";
  const version = await prisma.contractVersion.create({
    data: { contractId: id, label, data: contract.data ?? {} },
    select: { id: true, label: true, createdAt: true, data: true },
  });
  return NextResponse.json({ version });
}
