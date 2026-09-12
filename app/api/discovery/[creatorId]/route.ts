import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCreatorDetails } from "@/lib/youtube/discoveryEngine";

/** Full detail for the "media" panel — the search/library list already has everything except the
 * full description and notes, which aren't worth carrying around in every list row. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  const { creatorId } = await params;
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ creator });
}

interface PatchBody {
  email?: string | null;
  notes?: string | null;
  platformLinks?: Record<string, string>;
  audienceCountries?: { label: string; percent: number }[];
  audienceAgeRanges?: { label: string; percent: number }[];
  audienceGenderSplit?: { label: string; percent: number }[];
}

/** Manual edits from the creator detail view — an email or platform link extraction missed, real
 * audience demographics transcribed from the creator's own analytics, or a note for the team. See
 * lib/youtube/discoveryEngine.ts's updateCreatorDetails for exactly what this does and doesn't
 * overwrite. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ creatorId: string }> }) {
  const { creatorId } = await params;
  const body: PatchBody = await req.json();
  const result = await updateCreatorDetails(creatorId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
