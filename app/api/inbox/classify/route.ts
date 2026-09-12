import { NextRequest, NextResponse } from "next/server";
import { guessOutboundType } from "@/lib/outboundClassifier";
import { htmlToPlainText } from "@/lib/gmail";

/**
 * Live classification for the inbox Compose window — called (debounced) as the team types, so
 * the "This looks like…" pill can update as the recipient/subject/body fill in. Runs server-side
 * because the existing-contact lookup needs Prisma; the keyword fallback is cheap enough that this
 * costs nothing to call on every keystroke pause.
 */
export async function POST(req: NextRequest) {
  const { to, subject, html }: { to?: string; subject?: string; html?: string } = await req.json();
  const toEmail = (to ?? "").split(",")[0]?.trim() ?? "";

  const guess = await guessOutboundType({
    toEmail,
    subject: subject ?? "",
    bodyText: htmlToPlainText(html ?? ""),
  });

  return NextResponse.json({ guess });
}
