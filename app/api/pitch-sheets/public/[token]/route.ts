import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appBaseUrl, loadPublicPitchSheet, PitchSheetUnavailable } from "@/lib/pitchSheetServer";

export const dynamic = "force-dynamic";

/** The no-login lookup behind a brand's pitch-sheet link — public per middleware.ts's PUBLIC_PATHS;
 * the unguessable token is the only access control. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const sheet = await loadPublicPitchSheet(token, appBaseUrl(req.nextUrl.origin));
    await prisma.pitchSheet.update({ where: { id: sheet.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => undefined);
    // The internal row id isn't the brand's business — the token is all they need.
    const publicSheet: Omit<typeof sheet, "id"> & { id?: string } = { ...sheet };
    delete publicSheet.id;
    return NextResponse.json({ sheet: publicSheet }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof PitchSheetUnavailable) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
