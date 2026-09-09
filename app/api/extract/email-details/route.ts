import { NextRequest, NextResponse } from "next/server";
import { extractBrandDetailsFromEmail } from "@/lib/emailExtractor";

export async function POST(req: NextRequest) {
  const { emailText, isOutbound }: { emailText: string; isOutbound?: boolean } = await req.json();
  if (!emailText?.trim()) {
    return NextResponse.json({ error: "Paste the email text first" }, { status: 400 });
  }

  try {
    const details = await extractBrandDetailsFromEmail(emailText, { isOutbound });
    return NextResponse.json({ details });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed" },
      { status: 400 }
    );
  }
}
