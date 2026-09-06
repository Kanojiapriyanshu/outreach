import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwords";

export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const { name, email, password }: { name: string; email: string; password: string } = await req.json();
  if (!name || !email || !password || password.length < 8) {
    return NextResponse.json({ error: "Name, email, and an 8+ character password are required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing?.passwordHash) {
    return NextResponse.json({ error: "That email already has an account" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, passwordHash },
    create: { name, email: email.toLowerCase(), passwordHash, role: "member" },
  });

  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}
