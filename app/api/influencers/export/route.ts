import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatRate, parseStoredRates } from "@/lib/creatorReplyAnalysis";
import {
  csvCell,
  influencerSearchWhere,
  influencerViewWhere,
  parseInfluencerView,
  replyIntentLabel,
} from "@/lib/influencerOutreach";
import { statusLabel, stageLabelText } from "@/app/components/Badge";

const EXPORT_LIMIT = 5000;

/** The Influencer Outreach view as a spreadsheet — same filter and search as the page. */
export async function GET(req: NextRequest) {
  const view = parseInfluencerView(req.nextUrl.searchParams.get("view"));
  const q = req.nextUrl.searchParams.get("q");

  const sequences = await prisma.outreachSequence.findMany({
    where: { outreachType: "CREATOR", deletedAt: null, ...influencerViewWhere(view), ...influencerSearchWhere(q) },
    include: {
      contact: { include: { creator: true } },
      scheduledActions: { where: { status: "PENDING" }, orderBy: { scheduledAt: "asc" }, take: 1 },
      messages: { where: { direction: "OUT" }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
  });

  const header = [
    "Creator",
    "Email",
    "Channel",
    "Subscribers",
    "Stage",
    "Status",
    "Emails sent",
    "Replied",
    "Replied at",
    "Reply",
    "Needs your reply",
    "Headline rate",
    "All rates",
    "Rate note",
    "Last reply",
    "Next follow-up",
    "First contacted",
  ];

  const rows = sequences.map((s) => {
    const rates = parseStoredRates(s.quotedRates);
    const replied = !!s.lastReplyAt || s.status === "REPLIED" || s.status === "UNSUBSCRIBED";
    const headline =
      s.quotedRateAmount !== null
        ? formatRate({ amount: s.quotedRateAmount, amountMax: null, currency: s.quotedRateCurrency, deliverable: null }, false)
        : "";
    return [
      s.contact.creator?.name ?? s.contact.name,
      s.contact.email,
      s.contact.creator?.channelUrl ?? "",
      s.contact.creator?.subscriberCount ?? "",
      stageLabelText(s.stage),
      statusLabel(s.status),
      s.messages.length,
      replied ? "Yes" : "No",
      s.lastReplyAt?.toISOString() ?? "",
      replied ? replyIntentLabel(s.replyIntent) : "",
      s.awaitingResponseSince ? "Yes" : "No",
      headline,
      rates.map((r) => formatRate(r)).join("; "),
      s.rateNote ?? "",
      s.lastReplyText?.replace(/\s+/g, " ").slice(0, 500) ?? "",
      s.scheduledActions[0]?.scheduledAt.toISOString() ?? "",
      s.createdAt.toISOString(),
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  // BOM so Excel opens currency symbols and accented names as UTF-8 instead of mojibake.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="influencer-outreach-${view}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
