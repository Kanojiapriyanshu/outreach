import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emptyContract, normalizeContract } from "@/lib/contracts/template";

/** New contract from the standard template, or a copy of an existing one ({ fromId }). */
export async function POST(req: NextRequest) {
  let body: { fromId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body just means "start from the template".
  }

  if (body.fromId) {
    const source = await prisma.contract.findUnique({ where: { id: body.fromId } });
    if (!source) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    const data = normalizeContract(source.data);
    // A copy is for a new deal: keep the terms, clear the dates that belonged to the old one.
    data.fields.effectiveDate = "";
    data.fields.goLiveDate = "";
    const copy = await prisma.contract.create({ data: { title: `${source.title} (copy)`, data: JSON.parse(JSON.stringify(data)) } });
    return NextResponse.json({ id: copy.id });
  }

  const contract = await prisma.contract.create({ data: { title: "Untitled agreement", data: JSON.parse(JSON.stringify(emptyContract())) } });
  return NextResponse.json({ id: contract.id });
}
