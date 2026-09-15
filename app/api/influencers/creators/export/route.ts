import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { csvCell } from "@/lib/influencerOutreach";
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { parseRosterFilters, rosterOrderBy, rosterWhere } from "@/lib/creatorRoster";
import { stageLabelText, statusLabel } from "@/app/components/Badge";

const EXPORT_LIMIT = 5000;

/** The Creators roster as a spreadsheet — same filters as the page, one row per creator. */
export async function GET(req: NextRequest) {
  const filters = parseRosterFilters(Object.fromEntries(req.nextUrl.searchParams));
  const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean).slice(0, EXPORT_LIMIT);

  const creators = await prisma.creator.findMany({
    where: ids && ids.length > 0 ? { id: { in: ids } } : rosterWhere(filters),
    orderBy: rosterOrderBy(filters.sort),
    take: EXPORT_LIMIT,
    include: {
      contacts: {
        include: { sequences: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });

  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const header = [
    "Creator", "Channel", "Subscribers", "Avg views", "Engagement %", "Country", "Niche", "Content highlights",
    "Email", "Email source", "Instagram", "TikTok", "Pinterest", "Amazon storefront", "Facebook", "X / Twitter",
    "Websites", "Rate", "Rate for", "Rate date", "Outreach stage", "Outreach status", "Replied", "Last contacted",
    "Media kit link", "Notes",
  ];

  const rows = creators.map((c) => {
    const links = (c.platformLinks ?? {}) as Record<string, string>;
    const sequence = c.contacts.flatMap((contact) => contact.sequences).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const replied = !!sequence && (!!sequence.lastReplyAt || sequence.status === "REPLIED" || sequence.status === "UNSUBSCRIBED");
    return [
      c.channelName ?? c.name,
      c.channelUrl,
      c.subscriberCount,
      c.averageViews,
      c.engagementRate !== null ? c.engagementRate.toFixed(2) : "",
      c.country,
      c.niche,
      c.contentHighlights,
      c.email,
      c.email ? c.emailSource : "",
      links.instagram, links.tiktok, links.pinterest, links.amazonStorefront, links.facebook, links.twitter,
      c.websiteLinks.join(" "),
      c.quotedRateAmount !== null ? formatMoney(c.quotedRateAmount, c.quotedRateCurrency) : "",
      c.quotedRateDeliverable,
      c.quotedRateAt?.toISOString().slice(0, 10),
      sequence ? stageLabelText(sequence.stage) : "Not contacted",
      sequence ? statusLabel(sequence.status) : "",
      sequence ? (replied ? "Yes" : "No") : "",
      sequence?.createdAt.toISOString().slice(0, 10),
      c.mediaKitShareToken ? `${base}/media-kit/shared/${c.mediaKitShareToken}` : "",
      c.notes,
    ];
  });

  const csv = [header, ...rows].map((row) => row.map((cell) => csvCell(cell ?? "")).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="creators-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
