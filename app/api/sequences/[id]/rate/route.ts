import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatRate, mergeRates, parseStoredRates, primaryRate, type QuotedRate } from "@/lib/creatorReplyAnalysis";
import { syncCreatorRateFromSequence } from "@/lib/creatorProfileSync";

const CURRENCIES = new Set(["USD", "EUR", "GBP", "INR", "CAD", "AUD"]);
const MAX_RATE = 10_000_000;

interface RateBody {
  /** Omit (or null) together with no note to clear every recorded rate. */
  amount?: number | null;
  amountMax?: number | null;
  currency?: string | null;
  deliverable?: string | null;
  note?: string | null;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * Records a rate agreed or corrected outside the email thread (a call, a DM, a counter-offer), or
 * clears a wrongly read one. Entered prices replace the price for the same deliverable only, the
 * same way a later email quote does.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: RateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sequence = await prisma.outreachSequence.findUnique({ where: { id } });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (sequence.outreachType !== "CREATOR") {
    return NextResponse.json({ error: "Rates are only tracked for influencer outreach" }, { status: 400 });
  }

  const note = cleanText(body.note, 300);

  if ((body.amount === null || body.amount === undefined) && !note) {
    await prisma.$transaction([
      prisma.outreachSequence.update({
        where: { id },
        data: { quotedRates: [], quotedRateAmount: null, quotedRateCurrency: null, quotedRateAt: null, rateNote: null },
      }),
      prisma.activityLog.create({
        data: { sequenceId: id, eventType: "RATE_DETECTED", description: "Cleared the recorded rate." },
      }),
    ]);
    await syncCreatorRateFromSequence(id);
    return NextResponse.json({ ok: true });
  }

  let rates = parseStoredRates(sequence.quotedRates);
  let entered: QuotedRate | null = null;
  if (body.amount !== null && body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RATE) {
      return NextResponse.json({ error: "Enter a rate greater than 0" }, { status: 400 });
    }
    const amountMaxRaw = body.amountMax === null || body.amountMax === undefined ? null : Number(body.amountMax);
    if (amountMaxRaw !== null && (!Number.isFinite(amountMaxRaw) || amountMaxRaw > MAX_RATE)) {
      return NextResponse.json({ error: "That upper amount doesn't look right" }, { status: 400 });
    }
    const currency = body.currency ? String(body.currency).toUpperCase() : null;
    if (currency && !CURRENCIES.has(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }
    entered = {
      amount,
      amountMax: amountMaxRaw !== null && amountMaxRaw > amount ? amountMaxRaw : null,
      currency,
      deliverable: cleanText(body.deliverable, 40),
      raw: "Entered by hand",
      source: "manual",
    };
    rates = mergeRates(rates, [entered]);
  }

  const primary = primaryRate(rates);
  const advancesStage = ["FIRST_EMAIL_SENT", "INTERESTED"].includes(sequence.stage);

  await prisma.$transaction([
    prisma.outreachSequence.update({
      where: { id },
      data: {
        quotedRates: rates as object[],
        quotedRateAmount: primary?.amount ?? null,
        quotedRateCurrency: primary?.currency ?? null,
        quotedRateAt: new Date(),
        rateNote: note,
        ...(advancesStage ? { stage: "RATE_RECEIVED" as const } : {}),
      },
    }),
    prisma.activityLog.create({
      data: {
        sequenceId: id,
        eventType: "RATE_DETECTED",
        description: entered ? `Rate recorded by hand: ${formatRate(entered)}.` : "Rate note updated by hand.",
      },
    }),
    ...(advancesStage
      ? [
          prisma.activityLog.create({
            data: { sequenceId: id, eventType: "STAGE_CHANGED", description: "Stage set to Rate Received." },
          }),
        ]
      : []),
  ]);
  await syncCreatorRateFromSequence(id);

  return NextResponse.json({ ok: true });
}
