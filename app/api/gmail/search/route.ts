import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findSentThreadTo, gmailClientFor } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  const emailAccountId = req.nextUrl.searchParams.get("emailAccountId");
  if (!to) return NextResponse.json({ error: "Missing 'to' query param" }, { status: 400 });

  const account = emailAccountId
    ? await prisma.emailAccount.findUnique({ where: { id: emailAccountId } })
    : await prisma.emailAccount.findFirst({ where: { accessStatus: "CONNECTED" } });

  if (!account || account.accessStatus !== "CONNECTED") {
    return NextResponse.json({ error: "No connected email account" }, { status: 400 });
  }

  const gmail = await gmailClientFor(account.id);
  const results = await findSentThreadTo(gmail, to);

  return NextResponse.json({ emailAccountId: account.id, results });
}
