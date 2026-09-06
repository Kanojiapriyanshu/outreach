import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { brandTemplates, brandAgencyTemplates, creatorTemplates } from "@/lib/defaultTemplates";

export async function POST(req: NextRequest) {
  const { id }: { id: string } = await req.json();

  const current = await prisma.template.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const defaults =
    current.outreachType === "CREATOR"
      ? creatorTemplates
      : current.recipientType === "AGENCY"
        ? brandAgencyTemplates
        : brandTemplates;
  const def = defaults.find((t) => t.step === current.step);
  if (!def) return NextResponse.json({ error: "No default for this step" }, { status: 400 });

  const [, created] = await prisma.$transaction([
    prisma.template.update({ where: { id: current.id }, data: { isActive: false } }),
    prisma.template.create({
      data: {
        outreachType: current.outreachType,
        recipientType: current.recipientType,
        step: current.step,
        name: def.name,
        subject: def.subject,
        body: def.body,
        version: current.version + 1,
        isActive: true,
      },
    }),
  ]);

  return NextResponse.json({ template: created });
}
