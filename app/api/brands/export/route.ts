import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { csvCell } from "@/lib/influencerOutreach";
import { BRAND_BASE, brandReplyLabel, brandSearchWhere, brandViewWhere, parseBrandView } from "@/lib/brandOutreach";
import { budgetLabel, influencerRangeLabel } from "@/lib/display";
import { statusLabel, stageLabelText } from "@/app/components/Badge";

const EXPORT_LIMIT = 5000;

/** The Brand Outreach view as a spreadsheet — same filter and search as the page. */
export async function GET(req: NextRequest) {
  const view = parseBrandView(req.nextUrl.searchParams.get("view"));
  const q = req.nextUrl.searchParams.get("q");

  const sequences = await prisma.outreachSequence.findMany({
    where: { AND: [BRAND_BASE, brandViewWhere(view), brandSearchWhere(q)] },
    include: {
      contact: { include: { brand: true } },
      scheduledActions: { where: { status: "PENDING" }, orderBy: { scheduledAt: "asc" }, take: 1 },
      messages: { where: { direction: "OUT" }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
  });

  const header = [
    "Brand",
    "Agency",
    "Contact",
    "Email",
    "Category",
    "Budget",
    "Channel size wanted",
    "Stage",
    "Roster sent",
    "Status",
    "Emails sent",
    "Replied",
    "Replied at",
    "Reply",
    "Needs your reply",
    "Last reply",
    "Next follow-up",
    "Starred",
    "First contacted",
  ];

  const rows = sequences.map((s) => {
    const brand = s.contact.brand;
    const replied = !!s.lastReplyAt || s.status === "REPLIED" || s.status === "UNSUBSCRIBED";
    return [
      brand?.name ?? s.contact.name,
      brand?.isAgency ? "Yes" : "No",
      s.contact.name,
      s.contact.email,
      brand?.category ?? "",
      budgetLabel(brand?.budgetRangeText ?? null, brand?.budgetType ?? "UNKNOWN"),
      influencerRangeLabel(brand?.influencerRangeMin ?? null, brand?.influencerRangeMax ?? null),
      stageLabelText(s.stage),
      s.rosterSentAt?.toISOString() ?? "",
      statusLabel(s.status),
      s.messages.length,
      replied ? "Yes" : "No",
      s.lastReplyAt?.toISOString() ?? "",
      replied ? brandReplyLabel(s.replyIntent) : "",
      s.awaitingResponseSince ? "Yes" : "No",
      s.lastReplyText?.replace(/\s+/g, " ").slice(0, 500) ?? "",
      s.scheduledActions[0]?.scheduledAt.toISOString() ?? "",
      s.isImportant ? "Yes" : "No",
      s.createdAt.toISOString(),
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  // BOM so Excel opens currency symbols and accented names as UTF-8 instead of mojibake.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="brand-outreach-${view}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
