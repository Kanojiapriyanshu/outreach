import Link from "next/link";
import { Suspense } from "react";
import { Plus, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime, istDayStart, istDayEnd } from "@/lib/formatDate";
import {
  nextActionLabel,
  companyOrCreatorName,
  gmailThreadLink,
  budgetLabel,
  influencerRangeLabel,
} from "@/lib/display";
import Badge, { StageBadge } from "@/app/components/Badge";
import DashboardFilters from "./DashboardFilters";
import StarToggle from "./StarToggle";
import type { Prisma } from "@/app/generated/prisma/client";

type Tab = "all" | "brands" | "creators";
const PAGE_SIZE = 50;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    from?: string;
    to?: string;
    stage?: string;
    starred?: string;
    repliedAfterList?: string;
    page?: string;
  }>;
}) {
  const { tab: rawTab, q, from, to, stage, starred, repliedAfterList, page: rawPage } = await searchParams;
  const tab: Tab = rawTab === "brands" || rawTab === "creators" ? rawTab : "all";
  const page = Math.max(1, Number(rawPage) || 1);

  const where: Prisma.OutreachSequenceWhereInput = {
    deletedAt: null,
    ...(tab === "brands" ? { outreachType: "BRAND" as const } : tab === "creators" ? { outreachType: "CREATOR" as const } : {}),
    ...(q?.trim()
      ? {
          OR: [
            { contact: { name: { contains: q, mode: "insensitive" as const } } },
            { contact: { email: { contains: q, mode: "insensitive" as const } } },
            { contact: { brand: { name: { contains: q, mode: "insensitive" as const } } } },
            { contact: { creator: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: istDayStart(from) } : {}),
            ...(to ? { lte: istDayEnd(to) } : {}),
          },
        }
      : {}),
    ...(stage ? { stage: stage as Prisma.EnumPipelineStageFilter["equals"] } : {}),
    ...(starred === "1" ? { isImportant: true } : {}),
    ...(repliedAfterList === "1" ? { creatorListResponseAt: { not: null } } : {}),
  };

  const [totalCount, statsRows, sequences] = await Promise.all([
    prisma.outreachSequence.count({ where }),
    prisma.outreachSequence.findMany({
      where,
      select: { status: true, scheduledActions: { where: { status: "PENDING" }, select: { scheduledAt: true }, take: 1 } },
    }),
    prisma.outreachSequence.findMany({
      where,
      include: {
        contact: { include: { brand: true, creator: true } },
        scheduledActions: { where: { status: "PENDING" }, orderBy: { step: "asc" }, take: 1 },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const dueToday = statsRows.filter((s) => {
    const next = s.scheduledActions[0];
    if (!next) return false;
    const today = new Date();
    return next.scheduledAt.toDateString() === today.toDateString();
  }).length;

  const activeCount = statsRows.filter((s) =>
    ["WAITING_FOR_REPLY", "FOLLOW_UP_1_SENT", "FOLLOW_UP_2_SENT", "FOLLOW_UP_3_SENT", "PAUSED"].includes(s.status)
  ).length;

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Follow-ups the automation is tracking for you right now.
          </p>
        </div>
        <Link
          href="/track"
          className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm"
        >
          <Plus size={16} /> New Outreach
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="In Progress" value={activeCount} />
        <StatCard label="Due Today" value={dueToday} />
        <StatCard label="Total Contacted" value={totalCount} />
      </div>

      <div className="flex gap-1">
        <TabLink tab="all" active={tab === "all"} label="All" extraParams={{ q, from, to, stage, starred, repliedAfterList }} />
        <TabLink
          tab="brands"
          active={tab === "brands"}
          label="Brands"
          extraParams={{ q, from, to, stage, starred, repliedAfterList }}
        />
        <TabLink
          tab="creators"
          active={tab === "creators"}
          label="Creators"
          extraParams={{ q, from, to, stage, starred, repliedAfterList }}
        />
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <DashboardFilters />
      </Suspense>

      <div className="card overflow-hidden overflow-x-auto">
        {tab === "brands" ? (
          <BrandTable sequences={sequences} />
        ) : (
          <GenericTable sequences={sequences} />
        )}
      </div>

      <PaginationBar page={page} pageSize={PAGE_SIZE} totalCount={totalCount} extraParams={{ tab, q, from, to, stage, starred, repliedAfterList }} />
    </div>
  );
}

type SequenceRow = Awaited<ReturnType<typeof prisma.outreachSequence.findMany<{
  include: {
    contact: { include: { brand: true; creator: true } };
    scheduledActions: true;
    messages: true;
  };
}>>>[number];

/** Gmail-style exact last-activity line: who it was (sent/received) and the precise timestamp,
 * not just a date — matches how Gmail shows the last message time in a thread list. */
function LastMessageCell({ seq }: { seq: SequenceRow }) {
  const last = seq.messages[0];
  if (!last) return <span className="text-[var(--muted-2)]">—</span>;
  return (
    <div className="whitespace-nowrap">
      <div className="text-[var(--ink)]">{formatDateTime(last.sentAt)}</div>
      <div className="text-[var(--muted-2)] text-xs">{last.direction === "OUT" ? "You sent" : "They replied"}</div>
    </div>
  );
}

function GenericTable({ sequences }: { sequences: SequenceRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-[var(--muted)] text-left">
        <tr className="border-b border-[var(--border)]">
          <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Contact</th>
          <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Type</th>
          <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Company/Creator</th>
          <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Pipeline Stage</th>
          <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Next Action</th>
          <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Status</th>
          <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Last Message</th>
        </tr>
      </thead>
      <tbody>
        {sequences.length === 0 && (
          <tr>
            <td colSpan={7} className="px-5 py-14 text-center text-[var(--muted-2)] text-sm">
              Nothing here yet — click &quot;New Outreach&quot; above to get started.
            </td>
          </tr>
        )}
        {sequences.map((seq) => (
          <tr key={seq.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-2">
                <StarToggle sequenceId={seq.id} initialImportant={seq.isImportant} />
                <Link href={`/dashboard/${seq.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)]">
                  {seq.contact.name}
                </Link>
              </div>
            </td>
            <td className="px-5 py-3.5 text-[var(--muted)]">{seq.outreachType === "BRAND" ? "Brand" : "Creator"}</td>
            <td className="px-5 py-3.5 text-[var(--muted)]">{companyOrCreatorName(seq.contact)}</td>
            <td className="px-5 py-3.5">
              <StageBadge stage={seq.stage} />
            </td>
            <td className="px-5 py-3.5 text-[var(--muted)]">{nextActionLabel(seq.status, seq.scheduledActions[0]?.step)}</td>
            <td className="px-5 py-3.5">
              <Badge status={seq.status} />
            </td>
            <td className="px-5 py-3.5 text-sm">
              <LastMessageCell seq={seq} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BrandTable({ sequences }: { sequences: SequenceRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-[var(--muted)] text-left">
        <tr className="border-b border-[var(--border)]">
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">#</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Brand / Agency</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">What They Sell</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Email Address</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Conversation</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Budget</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Channel Size Wanted</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Pipeline Stage</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Status</th>
          <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Last Activity</th>
        </tr>
      </thead>
      <tbody>
        {sequences.length === 0 && (
          <tr>
            <td colSpan={10} className="px-5 py-14 text-center text-[var(--muted-2)] text-sm">
              No brands yet — click &quot;New Outreach&quot; above to get started.
            </td>
          </tr>
        )}
        {sequences.map((seq, i) => {
          const brand = seq.contact.brand;
          return (
            <tr key={seq.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
              <td className="px-4 py-3.5 text-[var(--muted-2)]">{i + 1}</td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <StarToggle sequenceId={seq.id} initialImportant={seq.isImportant} />
                  <Link href={`/dashboard/${seq.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)]">
                    {brand?.name ?? "—"}
                  </Link>
                  {brand?.isAgency && (
                    <span className="badge" style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}>
                      Agency
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3.5 text-[var(--muted)]">{brand?.category ?? "—"}</td>
              <td className="px-4 py-3.5 text-[var(--muted)]">{seq.contact.email}</td>
              <td className="px-4 py-3.5">
                <a
                  href={gmailThreadLink(seq.threadId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--brand-teal-dark)" }}
                >
                  Open Email <ExternalLink size={12} />
                </a>
              </td>
              <td className="px-4 py-3.5 text-[var(--muted)]">
                {budgetLabel(brand?.budgetRangeText ?? null, brand?.budgetType ?? "UNKNOWN")}
              </td>
              <td className="px-4 py-3.5 text-[var(--muted)]">
                {influencerRangeLabel(brand?.influencerRangeMin ?? null, brand?.influencerRangeMax ?? null)}
              </td>
              <td className="px-4 py-3.5">
                <StageBadge stage={seq.stage} />
              </td>
              <td className="px-4 py-3.5">
                <Badge status={seq.status} />
              </td>
              <td className="px-4 py-3.5 text-sm">
                <LastMessageCell seq={seq} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <div className="text-[26px] font-semibold tracking-tight text-[var(--ink)]">{value}</div>
      <div className="text-sm text-[var(--muted)] mt-0.5">{label}</div>
    </div>
  );
}

function buildQuery(extraParams: Record<string, string | undefined>, overrides: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...extraParams, ...overrides })) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function TabLink({
  tab,
  active,
  label,
  extraParams,
}: {
  tab: Tab;
  active: boolean;
  label: string;
  extraParams: Record<string, string | undefined>;
}) {
  return (
    <Link
      href={`/dashboard?${buildQuery(extraParams, { tab })}`}
      className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
        active
          ? "bg-[var(--ink)] text-[var(--ink-inverse)]"
          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </Link>
  );
}

/** Gmail-style "1-50 of 251" pager. */
function PaginationBar({
  page,
  pageSize,
  totalCount,
  extraParams,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  extraParams: Record<string, string | undefined>;
}) {
  if (totalCount === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const hasPrev = page > 1;
  const hasNext = end < totalCount;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
      <span className="text-[var(--muted)]">
        {start}–{end} of {totalCount}
      </span>
      <div className="flex gap-2">
        <Link
          href={`/dashboard?${buildQuery(extraParams, { page: String(page - 1) })}`}
          aria-disabled={!hasPrev}
          className={`btn-secondary px-3 py-1.5 text-xs ${!hasPrev ? "pointer-events-none opacity-40" : ""}`}
        >
          ← Newer
        </Link>
        <Link
          href={`/dashboard?${buildQuery(extraParams, { page: String(page + 1) })}`}
          aria-disabled={!hasNext}
          className={`btn-secondary px-3 py-1.5 text-xs ${!hasNext ? "pointer-events-none opacity-40" : ""}`}
        >
          Older →
        </Link>
      </div>
    </div>
  );
}
