import Link from "next/link";
import { Building2, Megaphone, Search, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { brandSearchWhere, BRAND_BASE, brandReplyLabel } from "@/lib/brandOutreach";
import { influencerSearchWhere, replyIntentLabel } from "@/lib/influencerOutreach";
import { StageBadge } from "@/app/components/Badge";
import { Avatar, EmptyState, PageHeader, Panel } from "@/app/components/ui";

export const dynamic = "force-dynamic";

const LIMIT = 12;

/** The top bar's search: brands, influencer threads and roster creators matching one query. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: raw } = await searchParams;
  const q = (raw ?? "").trim().slice(0, 100);

  if (!q) {
    return (
      <div className="space-y-6">
        <PageHeader title="Search" description="Find any brand, creator or email address across both workspaces." />
        <div className="card">
          <EmptyState icon={<Search size={18} />} title="Type in the search box above" body="Brand names, contact names, creator channels and email addresses all work." />
        </div>
      </div>
    );
  }

  const has = { contains: q, mode: "insensitive" as const };
  const [brands, creatorThreads, creators] = await Promise.all([
    prisma.outreachSequence.findMany({
      where: { AND: [BRAND_BASE, brandSearchWhere(q)] },
      include: { contact: { include: { brand: true } } },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
    }),
    prisma.outreachSequence.findMany({
      where: { AND: [{ outreachType: "CREATOR", deletedAt: null }, influencerSearchWhere(q)] },
      include: { contact: { include: { creator: true } } },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
    }),
    prisma.creator.findMany({
      where: { OR: [{ name: has }, { channelName: has }, { email: has }, { niche: has }] },
      orderBy: { subscriberCount: { sort: "desc", nulls: "last" } },
      take: LIMIT,
      select: { id: true, name: true, channelName: true, thumbnailUrl: true, niche: true, subscriberCount: true, email: true },
    }),
  ]);
  const total = brands.length + creatorThreads.length + creators.length;

  return (
    <div className="space-y-6">
      <PageHeader title={`Results for “${q}”`} description={total === 0 ? "Nothing matched — try a shorter name or part of an email address." : `${total} match${total === 1 ? "" : "es"} across brands and influencers.`} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title={`Brands · ${brands.length}`} icon={<Building2 size={14} />} action={{ href: `/brands?q=${encodeURIComponent(q)}`, label: "Open in Brand outreach" }}>
          {brands.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--muted-2)]">No brands match.</p>
          ) : (
            <ul>
              {brands.map((s) => {
                const name = s.contact.brand?.name ?? s.contact.name;
                return (
                  <li key={s.id}>
                    <Link href={`/dashboard/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                      <Avatar name={name} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--ink)] truncate">{name}</div>
                        <div className="text-xs text-[var(--muted-2)] truncate">
                          {s.contact.email}
                          {s.lastReplyAt ? ` · ${brandReplyLabel(s.replyIntent)}` : ""}
                        </div>
                      </div>
                      <StageBadge stage={s.stage} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={`Influencer threads · ${creatorThreads.length}`} icon={<Megaphone size={14} />} action={{ href: `/influencers?q=${encodeURIComponent(q)}`, label: "Open in Influencer outreach" }}>
          {creatorThreads.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--muted-2)]">No influencer outreach matches.</p>
          ) : (
            <ul>
              {creatorThreads.map((s) => {
                const name = s.contact.creator?.name ?? s.contact.name;
                return (
                  <li key={s.id}>
                    <Link href={`/dashboard/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                      <Avatar name={name} src={s.contact.creator?.thumbnailUrl} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--ink)] truncate">{name}</div>
                        <div className="text-xs text-[var(--muted-2)] truncate">
                          {s.contact.email}
                          {s.lastReplyAt ? ` · ${replyIntentLabel(s.replyIntent)}` : ""}
                        </div>
                      </div>
                      <StageBadge stage={s.stage} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={`Creators in your roster · ${creators.length}`} icon={<Users size={14} />} action={{ href: `/influencers/creators?q=${encodeURIComponent(q)}`, label: "Open in Creators" }} className="lg:col-span-2">
          {creators.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--muted-2)]">No saved creators match.</p>
          ) : (
            <ul className="grid sm:grid-cols-2">
              {creators.map((c) => {
                const name = c.channelName ?? c.name;
                return (
                  <li key={c.id}>
                    <Link href={`/influencers/creators?q=${encodeURIComponent(name)}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                      <Avatar name={name} src={c.thumbnailUrl} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--ink)] truncate">{name}</div>
                        <div className="text-xs text-[var(--muted-2)] truncate">
                          {[c.niche, c.subscriberCount !== null ? `${c.subscriberCount.toLocaleString("en-US")} subscribers` : null, c.email].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
