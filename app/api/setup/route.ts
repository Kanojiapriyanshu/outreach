import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const anyUserWithPassword = await prisma.user.findFirst({ where: { passwordHash: { not: null } } });
  return NextResponse.json({ needsSetup: !anyUserWithPassword });
}

/** Creates the first admin login. Only allowed while no user has a password set yet. */
export async function POST(req: NextRequest) {
  const existing = await prisma.user.findFirst({ where: { passwordHash: { not: null } } });
  if (existing) {
    return NextResponse.json({ error: "Setup has already been completed" }, { status: 400 });
  }

  const { name, email, password }: { name: string; email: string; password: string } = await req.json();
  if (!name || !email || !password || password.length < 8) {
    return NextResponse.json({ error: "Name, email, and an 8+ character password are required" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, passwordHash, role: "admin" },
    create: { name, email: email.toLowerCase(), passwordHash, role: "admin" },
  });

  const token = await createSessionToken(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
