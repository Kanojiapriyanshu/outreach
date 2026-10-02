import { Suspense } from "react";
import { Download } from "lucide-react";
import { Kpi, KpiGrid, PageHeader, Pager } from "@/app/components/ui";
import { prisma } from "@/lib/prisma";
import { parseStoredRates } from "@/lib/creatorReplyAnalysis";
import { matchSnippet, parseRosterFilters, rosterOrderBy, rosterQueryString, rosterWhere, searchTerms } from "@/lib/creatorRoster";
import { findKitTitleMatches, kitTitlesByKitId } from "@/lib/creatorSmartSearch";
import InfluencerTabs from "../InfluencerTabs";
import RosterFilters from "./RosterFilters";
import CreatorsTable, { type RosterRow } from "./CreatorsTable";
import GmailSyncButton from "./GmailSyncButton";

// Emails and media kits land from the background worker at any moment — never serve a cached copy.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function CreatorsRosterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filters = parseRosterFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const terms = searchTerms(filters.q);
  const kitMatches = terms.length > 0 ? await findKitTitleMatches(filters.q) : {};
  const where = rosterWhere(filters, kitMatches);

  const [total, withEmail, awaitingLookup, withRate, withKit, readyCount, filteredCount, creators] = await Promise.all([
    prisma.creator.count(),
    prisma.creator.count({ where: { email: { not: null } } }),
    prisma.creator.count({ where: { email: null, channelId: { not: null }, emailCheckedAt: null } }),
    prisma.creator.count({ where: { quotedRateAt: { not: null } } }),
    prisma.creator.count({ where: { mediaKitShareToken: { not: null } } }),
    prisma.creator.count({ where: rosterWhere({ q: "", email: "", platform: "", status: "ready", sort: "recent" }) }),
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
              select: {
                id: true,
                stage: true,
                status: true,
                lastReplyAt: true,
                awaitingResponseSince: true,
                createdAt: true,
                lastReplyText: true,
                replySummary: true,
                rateNote: true,
              },
            },
          },
        },
      },
    }),
  ]);

  // Only needed to explain a search match, so skipped entirely when nothing is searched.
  const kitTitles = terms.length > 0 ? await kitTitlesByKitId(creators.map((c) => c.mediaKitId ?? "")) : new Map<string, string[]>();

  const rows: RosterRow[] = creators.map((c) => {
    const card = parseStoredRates(c.rateCard).map(({ amount, currency, deliverable }) => ({ amount, currency, deliverable }));
    const sequence = c.contacts.flatMap((contact) => contact.sequences).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const replied = !!sequence && (!!sequence.lastReplyAt || sequence.status === "REPLIED" || sequence.status === "UNSUBSCRIBED");
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
      rateCard:
        card.length > 0
          ? card
          : c.quotedRateAmount !== null
            ? [{ amount: c.quotedRateAmount, currency: c.quotedRateCurrency, deliverable: c.quotedRateDeliverable }]
            : [],
      rateNote: c.rateNote,
      pitchRate: c.pitchRateAmount !== null ? { amount: c.pitchRateAmount, currency: c.pitchRateCurrency, deliverable: c.pitchRateDeliverable } : null,
      outreach: sequence
        ? {
            sequenceId: sequence.id,
            stage: sequence.stage,
            status: sequence.status,
            replied,
            awaiting: !!sequence.awaitingResponseSince,
            contactedAt: sequence.createdAt.toISOString(),
          }
        : null,
      mediaKitToken: c.mediaKitShareToken,
      mediaKitGeneratedAt: c.mediaKitGeneratedAt?.toISOString() ?? null,
      mediaKitQueued: !!c.mediaKitRequestedAt,
      readyToPitch: replied || c.quotedRateAt !== null,
      rateNoAmount: c.quotedRateAt !== null && c.quotedRateAmount === null,
      match: matchSnippet(
        [
          { label: "In their reply", text: sequence?.lastReplyText },
          { label: "Reply summary", text: sequence?.replySummary },
          { label: "In their videos", text: (c.mediaKitId && kitTitles.get(c.mediaKitId)?.join(" · ")) || null },
          { label: "Their content", text: c.contentHighlights ?? c.niche },
          { label: "Channel description", text: c.description },
          { label: "Your notes", text: c.notes },
          { label: "Their rate", text: [c.quotedRateDeliverable, c.rateNote, sequence?.rateNote].filter(Boolean).join(" · ") || null },
        ],
        terms
      ),
    };
  });

  const emailPercent = total > 0 ? Math.round((withEmail / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        workspace="influencers"
        section="Creators"
        title="Creators"
        description="Every creator you've found or pitched, in one place — contact details, platforms, rates and media kits. Tick creators to make a pitch sheet for a brand."
        actions={
          <>
            <GmailSyncButton />
            <a href={`/api/influencers/creators/export?${rosterQueryString(filters)}`} className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
              <Download size={15} /> Export
            </a>
          </>
        }
      />

      <InfluencerTabs active="creators" />

      <KpiGrid columns={6}>
        <Kpi label="Creators" value={total} />
        <Kpi label="Have an email" value={withEmail} hint={`${emailPercent}% of the roster`} href="/influencers/creators?email=has" />
        <Kpi label="Queued for email search" value={awaitingLookup} href="/influencers/creators?email=missing" />
        <Kpi label="Rates on file" value={withRate} href="/influencers/creators?status=rate&sort=rate" tone={withRate > 0 ? "success" : "default"} />
        <Kpi label="Media kits ready" value={withKit} />
        <Kpi label="Ready to pitch" value={readyCount} href="/influencers/creators?status=ready" tone={readyCount > 0 ? "accent" : "default"} hint="Replied or has a rate" />
      </KpiGrid>

      <Suspense fallback={<div className="h-10" />}>
        <RosterFilters filters={filters} />
      </Suspense>

      <CreatorsTable rows={rows} totalMatching={filteredCount} />

      <Pager page={page} pageSize={PAGE_SIZE} total={filteredCount} href={(p) => `/influencers/creators?${rosterQueryString(filters, { page: String(p) })}`} />
    </div>
  );
}
