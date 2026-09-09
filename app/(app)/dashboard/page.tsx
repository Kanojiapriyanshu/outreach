import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateOnly } from "@/lib/formatDate";
import {
  nextActionLabel,
  companyOrCreatorName,
  gmailThreadLink,
  budgetLabel,
  influencerRangeLabel,
} from "@/lib/display";
import Badge, { StageBadge } from "@/app/components/Badge";

type Tab = "all" | "brands" | "creators";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "brands" || rawTab === "creators" ? rawTab : "all";

  const sequences = await prisma.outreachSequence.findMany({
    where: tab === "brands" ? { outreachType: "BRAND" } : tab === "creators" ? { outreachType: "CREATOR" } : undefined,
    include: {
      contact: { include: { brand: true, creator: true } },
      scheduledActions: { where: { status: "PENDING" }, orderBy: { step: "asc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  const dueToday = sequences.filter((s) => {
    const next = s.scheduledActions[0];
    if (!next) return false;
    const today = new Date();
    return next.scheduledAt.toDateString() === today.toDateString();
  }).length;

  const activeCount = sequences.filter((s) =>
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
        <StatCard label="Total Contacted" value={sequences.length} />
      </div>

      <div className="flex gap-1">
        <TabLink tab="all" active={tab === "all"} label="All" />
        <TabLink tab="brands" active={tab === "brands"} label="Brands" />
        <TabLink tab="creators" active={tab === "creators"} label="Creators" />
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {tab === "brands" ? (
          <BrandTable sequences={sequences} />
        ) : (
          <GenericTable sequences={sequences} />
        )}
      </div>
    </div>
  );
}

type SequenceRow = Awaited<ReturnType<typeof prisma.outreachSequence.findMany<{
  include: {
    contact: { include: { brand: true; creator: true } };
    scheduledActions: true;
  };
}>>>[number];

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
        </tr>
      </thead>
      <tbody>
        {sequences.length === 0 && (
          <tr>
            <td colSpan={6} className="px-5 py-14 text-center text-[var(--muted-2)] text-sm">
              Nothing here yet — click &quot;New Outreach&quot; above to get started.
            </td>
          </tr>
        )}
        {sequences.map((seq) => (
          <tr key={seq.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
            <td className="px-5 py-3.5">
              <Link href={`/dashboard/${seq.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)]">
                {seq.contact.name}
              </Link>
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
                <Link href={`/dashboard/${seq.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)]">
                  {brand?.name ?? "—"}
                </Link>
                {brand?.isAgency && (
                  <span className="badge ml-2" style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}>
                    Agency
                  </span>
                )}
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
              <td className="px-4 py-3.5 text-[var(--muted-2)] whitespace-nowrap">
                {formatDateOnly(seq.updatedAt)}
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

function TabLink({ tab, active, label }: { tab: Tab; active: boolean; label: string }) {
  return (
    <Link
      href={`/dashboard?tab=${tab}`}
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
