import { headers } from "next/headers";
import { ExternalLink, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/pitchSheetServer";
import { ROSTER_ELIGIBLE, ROSTER_STAGES, creatorCategories, topCategories } from "@/lib/publicRosterRules";
import { StageBadge } from "@/app/components/Badge";
import { Avatar, EmptyState, Kpi, KpiGrid, PageHeader } from "@/app/components/ui";
import { compactNumber } from "@/app/components/public/BrandKit";
import InfluencerTabs from "../InfluencerTabs";
import { ShareRosterLink, VisibilityToggle } from "./RosterControls";

export const dynamic = "force-dynamic";

const STAGE_RANK: Record<string, number> = Object.fromEntries(ROSTER_STAGES.map((s, i) => [s, i]));

/**
 * The team's side of the public roster: who's on the page brands see, why they qualify, and a
 * switch to keep anyone off it. Creators join automatically once they're interested or give a rate.
 */
export default async function PublicRosterAdminPage() {
  const h = await headers();
  const base = appBaseUrl(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`);

  const creators = await prisma.creator.findMany({
    where: ROSTER_ELIGIBLE,
    orderBy: [{ rosterHidden: "asc" }, { subscriberCount: { sort: "desc", nulls: "last" } }],
    take: 1000,
    select: {
      id: true,
      name: true,
      channelName: true,
      channelUrl: true,
      thumbnailUrl: true,
      niche: true,
      contentHighlights: true,
      subscriberCount: true,
      engagementRate: true,
      mediaKitShareToken: true,
      quotedRateAt: true,
      rosterHidden: true,
      contacts: {
        select: { sequences: { where: { deletedAt: null, stage: { in: [...ROSTER_STAGES] } }, select: { id: true, stage: true } } },
      },
    },
  });

  const rows = creators.map((c) => {
    const sequences = c.contacts.flatMap((contact) => contact.sequences);
    const furthest = sequences.sort((a, b) => (STAGE_RANK[b.stage] ?? 0) - (STAGE_RANK[a.stage] ?? 0))[0];
    const displayName = c.channelName ?? c.name;
    return {
      ...c,
      displayName,
      categories: creatorCategories({ niche: c.niche, contentHighlights: c.contentHighlights, name: displayName }),
      stage: furthest?.stage ?? (c.quotedRateAt ? "RATE_RECEIVED" : null),
      sequenceId: furthest?.id ?? null,
    };
  });
  const shown = rows.filter((r) => !r.rosterHidden);
  const hidden = rows.length - shown.length;
  const reach = shown.reduce((sum, r) => sum + (r.subscriberCount ?? 0), 0);
  const noKit = shown.filter((r) => !r.mediaKitShareToken).length;
  const url = `${base}/roster`;

  return (
    <div className="space-y-6">
      <PageHeader
        workspace="influencers"
        section="Public roster"
        title="Public roster"
        description="One link for every brand — the creators you work with, with their audience numbers and media kits. Rates and contact details are never shown. Creators join automatically once they're interested or give you a rate."
        actions={
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
            <ExternalLink size={15} /> Open public page
          </a>
        }
      />

      <InfluencerTabs active="roster" />

      <ShareRosterLink url={url} niches={topCategories(shown.map((r) => r.categories))} />

      <KpiGrid columns={4}>
        <Kpi label="On the public roster" value={shown.length} tone={shown.length > 0 ? "accent" : "default"} hint="Interested or rate received" />
        <Kpi label="Combined subscribers" value={compactNumber(reach)} hint="What brands see in the header" />
        <Kpi label="Without a media kit" value={noKit} hint={noKit ? "Make one from Creators so brands can dig in" : "Every creator has one"} />
        <Kpi label="Hidden by you" value={hidden} />
      </KpiGrid>

      <div className="card overflow-hidden overflow-x-auto scroll-slim">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={18} />}
            title="Nobody on the roster yet"
            body="Creators appear here as soon as one replies interested or quotes a rate — from outreach here or synced from Gmail."
          />
        ) : (
          <table className="data-table min-w-[820px]">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Why they&apos;re on it</th>
                <th className="text-right">Subscribers</th>
                <th className="text-right">Engagement</th>
                <th>Media kit</th>
                <th className="text-right">On the page</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.rosterHidden ? { opacity: 0.55 } : undefined}>
                  <td>
                    <div className="flex items-center gap-2.5 min-w-[220px]">
                      <Avatar name={r.displayName} src={r.thumbnailUrl} />
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--ink)] truncate">
                          {r.sequenceId ? (
                            <a href={`/dashboard/${r.sequenceId}`} className="hover:text-[var(--brand-teal)]">
                              {r.displayName}
                            </a>
                          ) : (
                            r.displayName
                          )}
                        </div>
                        <div className="text-xs text-[var(--muted-2)] truncate">{r.categories.length ? r.categories.join(" · ") : "No category yet"}</div>
                      </div>
                    </div>
                  </td>
                  <td>{r.stage ? <StageBadge stage={r.stage} /> : <span className="text-xs text-[var(--muted-2)]">Rate on file</span>}</td>
                  <td className="text-right tabular">{r.subscriberCount !== null ? r.subscriberCount.toLocaleString("en-US") : "—"}</td>
                  <td className="text-right tabular">{r.engagementRate !== null ? `${r.engagementRate.toFixed(1)}%` : "—"}</td>
                  <td className="text-xs">
                    {r.mediaKitShareToken ? (
                      <span style={{ color: "var(--success-fg)" }}>Ready</span>
                    ) : (
                      <span className="text-[var(--muted-2)]">Not made yet</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <span className="text-xs" style={{ color: r.rosterHidden ? "var(--muted-2)" : "var(--success-fg)" }}>
                        {r.rosterHidden ? "Hidden" : "Shown"}
                      </span>
                      <VisibilityToggle creatorId={r.id} hidden={r.rosterHidden} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
