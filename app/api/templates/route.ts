import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTemplate } from "@/lib/templates";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type"); // BRAND | CREATOR | null

  const templates = await prisma.template.findMany({
    where: { isActive: true, ...(type ? { outreachType: type as "BRAND" | "CREATOR" } : {}) },
    orderBy: [{ outreachType: "asc" }, { step: "asc" }],
  });

  return NextResponse.json({ templates });
}

interface UpdateBody {
  id: string;
  subject: string;
  body: string;
}

/**
 * PRD §26 — editing a template never mutates a version already referenced by a ScheduledAction.
 * It creates a new version, marks it active, and deactivates the old one.
 */
export async function PUT(req: NextRequest) {
  const { id, subject, body }: UpdateBody = await req.json();

  const current = await prisma.template.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const validation = validateTemplate(subject, body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  const [, created] = await prisma.$transaction([
    prisma.template.update({ where: { id: current.id }, data: { isActive: false } }),
    prisma.template.create({
      data: {
        outreachType: current.outreachType,
        recipientType: current.recipientType,
        step: current.step,
        name: current.name,
        subject,
        body,
        version: current.version + 1,
        isActive: true,
      },
    }),
  ]);

  return NextResponse.json({ template: created });
}
