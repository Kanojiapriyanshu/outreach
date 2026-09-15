import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { parseRosterFilters, rosterOrderBy, rosterQueryString, rosterWhere } from "@/lib/creatorRoster";
import InfluencerTabs from "../InfluencerTabs";
import RosterFilters from "./RosterFilters";
import CreatorsTable, { type RosterRow } from "./CreatorsTable";

// Emails and media kits land from the background worker at any moment — never serve a cached copy.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function CreatorsRosterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filters = parseRosterFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const where = rosterWhere(filters);

  const [total, withEmail, awaitingLookup, withRate, withKit, filteredCount, creators] = await Promise.all([
    prisma.creator.count(),
    prisma.creator.count({ where: { email: { not: null } } }),
    prisma.creator.count({ where: { email: null, channelId: { not: null }, emailCheckedAt: null } }),
    prisma.creator.count({ where: { quotedRateAt: { not: null } } }),
    prisma.creator.count({ where: { mediaKitShareToken: { not: null } } }),
    prisma.creator.count({ where }),
    prisma.creator.findMany({
      where,
      orderBy: rosterOrderBy(filters.sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        contacts: {
          include: {
            sequences: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, stage: true, status: true, lastReplyAt: true, awaitingResponseSince: true, createdAt: true },
            },
          },
        },
      },
    }),
  ]);

  const rows: RosterRow[] = creators.map((c) => {
    const sequence = c.contacts.flatMap((contact) => contact.sequences).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      id: c.id,
      name: c.channelName ?? c.name,
      channelUrl: c.channelUrl,
      thumbnailUrl: c.thumbnailUrl,
      country: c.country,
      niche: c.niche,
      contentHighlights: c.contentHighlights,
      subscriberCount: c.subscriberCount,
      averageViews: c.averageViews,
      engagementRate: c.engagementRate,
      hasChannel: !!c.channelId,
      email: c.email,
      emailSource: c.emailSource,
      emailCheckedAt: c.emailCheckedAt?.toISOString() ?? null,
      platformLinks: (c.platformLinks ?? {}) as Record<string, string>,
      websiteLinks: c.websiteLinks,
      rate:
        c.quotedRateAmount !== null
          ? { amount: c.quotedRateAmount, currency: c.quotedRateCurrency, deliverable: c.quotedRateDeliverable, at: c.quotedRateAt?.toISOString() ?? null }
          : null,
      outreach: sequence
        ? {
            sequenceId: sequence.id,
            stage: sequence.stage,
            status: sequence.status,
            replied: !!sequence.lastReplyAt || sequence.status === "REPLIED" || sequence.status === "UNSUBSCRIBED",
            awaiting: !!sequence.awaitingResponseSince,
            contactedAt: sequence.createdAt.toISOString(),
          }
        : null,
      mediaKitToken: c.mediaKitShareToken,
      mediaKitGeneratedAt: c.mediaKitGeneratedAt?.toISOString() ?? null,
      mediaKitQueued: !!c.mediaKitRequestedAt,
    };
  });

  const emailPercent = total > 0 ? Math.round((withEmail / total) * 100) : 0;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, filteredCount);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Influencer Outreach</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Every creator you&apos;ve found or pitched, in one place — contact details, platforms, rates and media kits.
          </p>
        </div>
        <a href={`/api/influencers/creators/export?${rosterQueryString(filters)}`} className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm">
          <Download size={15} /> Export CSV
        </a>
      </div>

      <InfluencerTabs active="creators" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Creators" value={total} />
        <Stat label={`Have an email · ${emailPercent}%`} value={withEmail} href="/influencers/creators?email=has" />
        <Stat label="Queued for email search" value={awaitingLookup} href="/influencers/creators?email=missing" />
        <Stat label="Rates on file" value={withRate} href="/influencers/creators?status=rate&sort=rate" />
        <Stat label="Media kits ready" value={withKit} />
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <RosterFilters filters={filters} />
      </Suspense>

      <CreatorsTable rows={rows} totalMatching={filteredCount} />

      {filteredCount > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
          <span className="text-[var(--muted)]">
            {start}–{end} of {filteredCount}
          </span>
          <div className="flex gap-2">
            <Link
              href={`/influencers/creators?${rosterQueryString(filters, { page: String(page - 1) })}`}
              aria-disabled={page <= 1}
              className={`btn-secondary px-3 py-1.5 text-xs ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              ← Previous
            </Link>
            <Link
              href={`/influencers/creators?${rosterQueryString(filters, { page: String(page + 1) })}`}
              aria-disabled={end >= filteredCount}
              className={`btn-secondary px-3 py-1.5 text-xs ${end >= filteredCount ? "pointer-events-none opacity-40" : ""}`}
            >
              Next →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="card p-4 h-full">
      <div className="text-[24px] font-semibold tracking-tight leading-none text-[var(--ink)]">{value}</div>
      <div className="text-xs text-[var(--muted)] mt-1.5">{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80 transition-opacity">
      {inner}
    </Link>
  ) : (
    inner
  );
}
