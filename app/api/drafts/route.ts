import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const drafts = await prisma.draft.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ drafts });
}

interface DraftBody {
  outreachType: "BRAND" | "CREATOR";
  recipientType?: "DIRECT" | "AGENCY";
  contactEmail?: string;
  contactName?: string;
  emailAccountId?: string | null;
  payload: unknown;
}

export async function POST(req: NextRequest) {
  const body: DraftBody = await req.json();
  if (!body.outreachType) return NextResponse.json({ error: "Missing outreachType" }, { status: 400 });

  const draft = await prisma.draft.create({
    data: {
      outreachType: body.outreachType,
      recipientType: body.recipientType ?? "DIRECT",
      contactEmail: body.contactEmail ?? "",
      contactName: body.contactName ?? "",
      emailAccountId: body.emailAccountId ?? null,
      payload: body.payload as object,
    },
  });
  return NextResponse.json({ draft });
}
