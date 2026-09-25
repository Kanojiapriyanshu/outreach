import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Suggestions for the contract form, so nothing already in the CRM is typed twice:
 * ?kind=creator → roster creators (channel name + URL); ?kind=brand → brands and their contact.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const kind = req.nextUrl.searchParams.get("kind");
  if (q.length < 2) return NextResponse.json({ results: [] });
  const has = { contains: q, mode: "insensitive" as const };

  if (kind === "creator") {
    const creators = await prisma.creator.findMany({
      where: { OR: [{ channelName: has }, { name: has }, { channelUrl: has }] },
      orderBy: [{ quotedRateAt: { sort: "desc", nulls: "last" } }, { subscriberCount: { sort: "desc", nulls: "last" } }],
      take: 8,
      select: { id: true, name: true, channelName: true, channelUrl: true, subscriberCount: true, quotedRateAmount: true, quotedRateCurrency: true },
    });
    return NextResponse.json({
      results: creators.map((c) => ({
        id: c.id,
        name: c.channelName ?? c.name,
        channelUrl: c.channelUrl ?? "",
        subscriberCount: c.subscriberCount,
        quotedRate: c.quotedRateAmount,
        quotedRateCurrency: c.quotedRateCurrency,
      })),
    });
  }

  if (kind === "brand") {
    const brands = await prisma.brand.findMany({
      where: { name: has },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, contacts: { take: 1, orderBy: { createdAt: "asc" }, select: { name: true, email: true } } },
    });
    return NextResponse.json({
      results: brands.map((b) => ({ id: b.id, name: b.name, contactName: b.contacts[0]?.name ?? "", contactEmail: b.contacts[0]?.email ?? "" })),
    });
  }

  return NextResponse.json({ error: "kind must be creator or brand" }, { status: 400 });
}
