import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOAuthClient } from "@/lib/gmail";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dailySendLimit }: { dailySendLimit: number } = await req.json();

  if (!Number.isInteger(dailySendLimit) || dailySendLimit <= 0) {
    return NextResponse.json({ error: "dailySendLimit must be a positive integer" }, { status: 400 });
  }

  const account = await prisma.emailAccount.update({
    where: { id },
    data: { dailySendLimit },
    select: { id: true, email: true, dailySendLimit: true },
  });
  return NextResponse.json({ account });
}

/** Disconnects a Gmail account: revokes the token with Google and clears it locally (PRD §50 — least-privilege). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await prisma.emailAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  if (account.accessToken) {
    try {
      const client = getOAuthClient();
      await client.revokeToken(account.accessToken);
    } catch {
      // Token may already be invalid/expired on Google's side; local disconnect still proceeds.
    }
  }

  await prisma.emailAccount.update({
    where: { id },
    data: {
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      accessStatus: "DISCONNECTED",
    },
  });

  return NextResponse.json({ ok: true });
}
