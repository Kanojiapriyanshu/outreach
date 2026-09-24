import { NextRequest, NextResponse } from "next/server";
import { csvCell } from "@/lib/influencerOutreach";
import { appBaseUrl, loadPublicPitchSheet, PitchSheetUnavailable } from "@/lib/pitchSheetServer";

export const dynamic = "force-dynamic";

/**
 * The same sheet as a CSV. In Google Sheets, =IMPORTDATA("<this url>") pulls it in and refreshes
 * on its own, so a Google Sheet can mirror the link. Stops returning rows once the link expires.
 * Not counted as a view — Sheets re-fetches it on a timer.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const sheet = await loadPublicPitchSheet(token, appBaseUrl(req.nextUrl.origin));
    // The handle rides along in the Creator column: on its own, a cell starting with "@" gets the
    // spreadsheet-formula guard from csvCell and would show up as '@handle.
    const header = ["Creator", "YouTube channel", "Subscribers", "Avg views", "Engagement %", "Country", "Focus", "Media kit", "Deliverable & rate"];
    const rows = sheet.creators.map((c) => [
      c.handle ? `${c.name} (${c.handle})` : c.name,
      c.channelUrl,
      c.subscriberCount,
      c.averageViews,
      c.engagementRate !== null ? c.engagementRate.toFixed(2) : "",
      c.country,
      c.focus,
      c.mediaKitUrl,
      c.rate,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof PitchSheetUnavailable) return new NextResponse(err.message, { status: err.status });
    throw err;
  }
}
