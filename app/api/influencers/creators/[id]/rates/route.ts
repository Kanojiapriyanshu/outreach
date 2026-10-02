import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { primaryRate, type QuotedRate } from "@/lib/creatorReplyAnalysis";

const CURRENCIES = new Set(["USD", "EUR", "GBP", "INR", "CAD", "AUD"]);
const MAX_RATE = 10_000_000;
const MAX_LINES = 30;

interface RateLine {
  amount?: number | string | null;
  currency?: string | null;
  deliverable?: string | null;
}

interface RatesBody {
  /** The creator's real rate card — replaces what's on file. Leave out to keep it. */
  rateCard?: RateLine[];
  rateNote?: string | null;
  /** The brand pitch rate. Null (or no amount) clears it; leave out to keep it. */
  pitch?: RateLine | null;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, max) || null;
}

function parseLine(line: RateLine): { amount: number; currency: string | null; deliverable: string | null } | string | null {
  if (line.amount === null || line.amount === undefined || String(line.amount).trim() === "") return null;
  const amount = Number(String(line.amount).replace(/[,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RATE) return "Enter each price as a number greater than 0";
  const currency = line.currency ? String(line.currency).toUpperCase() : null;
  if (currency && !CURRENCIES.has(currency)) return "Unsupported currency";
  return { amount, currency, deliverable: cleanText(line.deliverable, 60) };
}

/**
 * The team's own edit of a creator's rates: the real rate card (what the creator charges — nothing
 * automatic ever changes it once set) and the brand pitch rate (what we quote a brand).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: RatesBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const creator = await prisma.creator.findUnique({ where: { id }, select: { id: true, quotedRateAt: true } });
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (Array.isArray(body.rateCard)) {
    const card: QuotedRate[] = [];
    for (const line of body.rateCard.slice(0, MAX_LINES)) {
      const parsed = parseLine(line);
      if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
      if (parsed) card.push({ ...parsed, amountMax: null, raw: "Entered by hand", source: "manual" });
    }
    const note = cleanText(body.rateNote, 500);
    const primary = primaryRate(card);
    data.rateCard = card;
    data.rateNote = note;
    data.quotedRateAmount = primary?.amount ?? null;
    data.quotedRateCurrency = primary?.currency ?? null;
    data.quotedRateDeliverable = primary?.deliverable ?? null;
    data.quotedRateAt = card.length > 0 || note ? (creator.quotedRateAt ?? new Date()) : null;
  }

  if (body.pitch !== undefined) {
    const parsed = body.pitch ? parseLine(body.pitch) : null;
    if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
    data.pitchRateAmount = parsed?.amount ?? null;
    data.pitchRateCurrency = parsed?.currency ?? null;
    data.pitchRateDeliverable = parsed?.deliverable ?? null;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  await prisma.creator.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
