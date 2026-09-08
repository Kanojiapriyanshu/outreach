import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderScheduledActionContent } from "@/lib/scheduler";

async function loadActionWithSequence(id: string) {
  return prisma.scheduledAction.findUnique({
    where: { id },
    include: { sequence: { include: { contact: true } } },
  });
}

/** Preview exactly what this upcoming follow-up/nudge would send right now. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const action = await loadActionWithSequence(id);
  if (!action) return NextResponse.json({ error: "Scheduled action not found" }, { status: 404 });

  const rendered = await renderScheduledActionContent(action, action.sequence);
  if (!rendered) {
    return NextResponse.json({ error: "No template is set up for this step yet" }, { status: 400 });
  }

  return NextResponse.json({
    subject: rendered.subject,
    body: rendered.body,
    isOverridden: rendered.isOverridden,
    step: action.step,
    kind: action.kind,
    scheduledAt: action.scheduledAt,
    status: action.status,
  });
}

interface PatchBody {
  subject?: string;
  body?: string;
  reset?: boolean;
}

/** Saves (or clears) a direct edit of this specific upcoming send — takes over from auto-render. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { subject, body, reset }: PatchBody = await req.json();

  const action = await prisma.scheduledAction.findUnique({ where: { id } });
  if (!action) return NextResponse.json({ error: "Scheduled action not found" }, { status: 404 });
  if (action.status !== "PENDING") {
    return NextResponse.json({ error: "This one has already gone out — nothing left to edit" }, { status: 400 });
  }

  if (reset) {
    await prisma.scheduledAction.update({ where: { id }, data: { subjectOverride: null, bodyOverride: null } });
    return NextResponse.json({ ok: true });
  }

  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Subject and body can't be empty" }, { status: 400 });
  }

  await prisma.scheduledAction.update({ where: { id }, data: { subjectOverride: subject, bodyOverride: body } });
  return NextResponse.json({ ok: true });
}
