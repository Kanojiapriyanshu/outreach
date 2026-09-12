import { Suspense } from "react";
import Link from "next/link";
import { Compass } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { getUnitsUsedToday } from "@/lib/youtube/discoveryEngine";
import SearchTab from "./SearchTab";
import LibraryFilters from "./LibraryFilters";
import CreatorCard, { type CreatorCardData } from "./CreatorCard";

export const dynamic = "force-dynamic";

type Tab = "search" | "library";
const PAGE_SIZE = 24;

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    country?: string;
    minSubscribers?: string;
    maxSubscribers?: string;
    page?: string;
  }>;
}) {
  const { tab: rawTab, q, country, minSubscribers, maxSubscribers, page: rawPage } = await searchParams;
  const tab: Tab = rawTab === "library" ? "library" : "search";
  const unitsUsedToday = await getUnitsUsedToday();

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)] flex items-center gap-2">
            <Compass size={22} /> Creator Discovery
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Search YouTube by niche, country, and audience size — business email and platform links are pulled
            straight from each channel automatically, so there&apos;s nothing left to hunt for by hand.
          </p>
        </div>
        <div className="text-xs text-[var(--muted-2)] whitespace-nowrap">{unitsUsedToday.toLocaleString()} API units used today</div>
      </div>

      <div className="flex gap-1">
        <TabLink tab="search" active={tab === "search"} label="Search" />
        <TabLink tab="library" active={tab === "library"} label="Library" />
      </div>

      {tab === "search" ? (
        <SearchTab />
      ) : (
        <LibraryTab q={q} country={country} minSubscribers={minSubscribers} maxSubscribers={maxSubscribers} page={rawPage} />
      )}
    </div>
  );
}

function TabLink({ tab, active, label }: { tab: Tab; active: boolean; label: string }) {
  return (
    <Link
      href={`/discovery?tab=${tab}`}
      className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
        active ? "bg-[var(--ink)] text-[var(--ink-inverse)]" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </Link>
  );
}

async function LibraryTab({
  q,
  country,
  minSubscribers,
  maxSubscribers,
  page: rawPage,
}: {
  q?: string;
  country?: string;
  minSubscribers?: string;
  maxSubscribers?: string;
  page?: string;
}) {
  const page = Math.max(1, Number(rawPage) || 1);

  // channelId is only ever set by Discovery's own search — this is what keeps the Library scoped
  // to creators actually found here, rather than every hand-entered Creator from New Outreach too.
  const where: Prisma.CreatorWhereInput = {
    channelId: { not: null },
    ...(q?.trim()
      ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { niche: { contains: q, mode: "insensitive" as const } }] }
      : {}),
    ...(country?.trim() ? { country: country.trim().toUpperCase() } : {}),
    ...(minSubscribers || maxSubscribers
      ? {
          subscriberCount: {
            ...(minSubscribers ? { gte: Number(minSubscribers) } : {}),
            ...(maxSubscribers ? { lte: Number(maxSubscribers) } : {}),
          },
        }
      : {}),
  };

  const [totalCount, creators] = await Promise.all([
    prisma.creator.count({ where }),
    prisma.creator.findMany({
      where,
      orderBy: { lastDiscoveredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const cards: CreatorCardData[] = creators.map((c) => ({
    channelId: c.channelId!,
    title: c.name,
    channelUrl: c.channelUrl ?? "",
    thumbnailUrl: c.thumbnailUrl ?? "",
    country: c.country ?? "",
    subscriberCount: c.subscriberCount ?? 0,
    subscriberCountDisplay: undefined,
    averageViews: c.averageViews ?? 0,
    engagementRate: c.engagementRate ?? 0,
    lastUploadAt: c.lastUploadAt ? c.lastUploadAt.toISOString() : null,
    email: c.email,
    platformLinks: (c.platformLinks as Record<string, string>) ?? {},
    alreadyInLibrary: true,
    existingInsightReportId: null,
    creatorId: c.id,
    niche: c.niche ?? "",
  }));

  return (
    <div className="space-y-5">
      <Suspense fallback={<div className="h-10" />}>
        <LibraryFilters />
      </Suspense>

      {cards.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--muted-2)]">
          {q || country || minSubscribers || maxSubscribers
            ? "Nothing in the Library matches those filters."
            : "Nothing discovered yet — run a search and it'll show up here automatically."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => (
            <CreatorCard key={c.channelId} creator={c} />
          ))}
        </div>
      )}

      <LibraryPagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} q={q} country={country} minSubscribers={minSubscribers} maxSubscribers={maxSubscribers} />
    </div>
  );
}

function LibraryPagination({
  page,
  pageSize,
  totalCount,
  q,
  country,
  minSubscribers,
  maxSubscribers,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  q?: string;
  country?: string;
  minSubscribers?: string;
  maxSubscribers?: string;
}) {
  if (totalCount === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const params = new URLSearchParams();
  params.set("tab", "library");
  if (q) params.set("q", q);
  if (country) params.set("country", country);
  if (minSubscribers) params.set("minSubscribers", minSubscribers);
  if (maxSubscribers) params.set("maxSubscribers", maxSubscribers);

  const hrefFor = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return `/discovery?${next.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
      <span className="text-[var(--muted)]">
        {start}–{end} of {totalCount}
      </span>
      <div className="flex gap-2">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          className={`btn-secondary px-3 py-1.5 text-xs ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
        >
          ← Newer
        </Link>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={end >= totalCount}
          className={`btn-secondary px-3 py-1.5 text-xs ${end >= totalCount ? "pointer-events-none opacity-40" : ""}`}
        >
          Older →
        </Link>
      </div>
    </div>
  );
}
