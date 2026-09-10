import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await prisma.draft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  return NextResponse.json({ draft });
}

interface DraftBody {
  outreachType?: "BRAND" | "CREATOR";
  recipientType?: "DIRECT" | "AGENCY";
  contactEmail?: string;
  contactName?: string;
  emailAccountId?: string | null;
  payload?: unknown;
}

/** Autosaves over an existing draft — same shape as create, just updates in place instead of
 * making a new row every time the compose form changes. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: DraftBody = await req.json();

  const existing = await prisma.draft.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const draft = await prisma.draft.update({
    where: { id },
    data: {
      ...(body.outreachType ? { outreachType: body.outreachType } : {}),
      ...(body.recipientType ? { recipientType: body.recipientType } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
      ...(body.emailAccountId !== undefined ? { emailAccountId: body.emailAccountId } : {}),
      ...(body.payload !== undefined ? { payload: body.payload as object } : {}),
    },
  });
  return NextResponse.json({ draft });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.draft.deleteMany({ where: { id } }); // deleteMany so deleting an already-gone draft isn't an error
  return NextResponse.json({ ok: true });
}
