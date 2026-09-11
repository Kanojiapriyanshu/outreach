import Link from "next/link";
import { Plus, ArrowRight, Mail, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { companyOrCreatorName } from "@/lib/display";
import { formatDateTime } from "@/lib/formatDate";
import { StageBadge } from "@/app/components/Badge";

// Always render fresh — a dashboard showing numbers frozen at build time would be actively
// misleading, which is exactly the bug this project hit on /activity and /analytics before.
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["WAITING_FOR_REPLY", "FOLLOW_UP_1_SENT", "FOLLOW_UP_2_SENT", "FOLLOW_UP_3_SENT"] as const;

/** The stages an outreach moves through, in order, so the funnel reads top to bottom. */
const FUNNEL_STAGES = [
  { key: "FIRST_EMAIL_SENT", label: "Contacted" },
  { key: "CREATOR_LIST_REQUESTED", label: "Wants creator list" },
  { key: "CREATOR_LIST_SENT", label: "List sent" },
  { key: "NEGOTIATION", label: "Negotiating" },
  { key: "CREATOR_SELECTED", label: "Creator picked" },
  { key: "DEAL", label: "Deal closed" },
] as const;

async function resultsFor(outreachType: "BRAND" | "CREATOR") {
  const rows = await prisma.outreachSequence.findMany({
    where: { outreachType, deletedAt: null },
    select: { status: true, currentStep: true },
  });
  const total = rows.length;
  const replied = rows.filter((s) => s.status === "REPLIED").length;
  const repliedRows = rows.filter((s) => s.status === "REPLIED");
  return {
    total,
    replied,
    replyRate: total > 0 ? (replied / total) * 100 : 0,
    bounced: rows.filter((s) => s.status === "BOUNCED").length,
    noReply: rows.filter((s) => s.status === "COMPLETED").length,
    byFollowUp: [1, 2, 3].map((step) => repliedRows.filter((s) => s.currentStep === step).length),
  };
}

export default async function DashboardPage() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [
    brand,
    creator,
    activeCount,
    dueToday,
    unreadMail,
    needsReply,
    problems,
    upcoming,
    stageCounts,
    deals,
  ] = await Promise.all([
    resultsFor("BRAND"),
    resultsFor("CREATOR"),
    prisma.outreachSequence.count({ where: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } } }),
    prisma.scheduledAction.count({
      where: { status: "PENDING", scheduledAt: { gte: startOfToday, lt: endOfToday }, sequence: { deletedAt: null } },
    }),
    prisma.inboxThread.count({ where: { isUnread: true, isArchived: false, isTrashed: false } }),
    // Someone replied and the ball is in our court — the single most valuable list on this page.
    prisma.outreachSequence.findMany({
      where: { deletedAt: null, status: "REPLIED", stage: { notIn: ["DEAL", "NOT_INTERESTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: { contact: { include: { brand: true, creator: true } } },
    }),
    prisma.outreachSequence.findMany({
      where: { deletedAt: null, status: { in: ["BOUNCED", "UNSUBSCRIBED"] } },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: { contact: { include: { brand: true, creator: true } } },
    }),
    prisma.scheduledAction.findMany({
      where: { status: "PENDING", sequence: { deletedAt: null } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: { sequence: { include: { contact: { include: { brand: true, creator: true } } } } },
    }),
    prisma.outreachSequence.groupBy({
      by: ["stage"],
      where: { deletedAt: null },
      _count: true,
    }),
    prisma.outreachSequence.count({ where: { deletedAt: null, stage: "DEAL" } }),
  ]);

  const totalContacted = brand.total + creator.total;
  const totalReplied = brand.replied + creator.replied;
  const overallReplyRate = totalContacted > 0 ? (totalReplied / totalContacted) * 100 : 0;
  const stageMap = new Map(stageCounts.map((s) => [s.stage, s._count]));
  const funnelMax = Math.max(1, ...FUNNEL_STAGES.map((s) => stageMap.get(s.key) ?? 0));

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">Where outreach stands, and what needs you today.</p>
        </div>
        <Link href="/track" className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm">
          <Plus size={16} /> New Outreach
        </Link>
      </div>

      {/* The numbers worth glancing at every morning */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Unread mail" value={unreadMail} href="/inbox" tone={unreadMail > 0 ? "accent" : "default"} />
        <StatCard label="Waiting on you" value={needsReply.length} tone={needsReply.length > 0 ? "accent" : "default"} />
        <StatCard label="Sending today" value={dueToday} href="/scheduled" />
        <StatCard label="In progress" value={activeCount} href="/pipeline" />
        <StatCard label="Reply rate" value={`${overallReplyRate.toFixed(1)}%`} href="/pipeline" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Replies waiting on a human — the highest-value thing on the page */}
        <section className="card overflow-hidden">
          <SectionHeader
            icon={<Mail size={14} />}
            title="Replied — waiting on you"
            action={needsReply.length > 0 ? { href: "/inbox", label: "Open inbox" } : undefined}
          />
          {needsReply.length === 0 ? (
            <Empty text="Nothing waiting. Every reply has been moved along." />
          ) : (
            <ul>
              {needsReply.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/dashboard/${s.id}`}
                    className="flex items-center gap-3 px-5 py-3 border-t border-[var(--border)] hover:bg-[var(--bg)] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-[var(--ink)] truncate">
                        {companyOrCreatorName(s.contact)}
                      </div>
                      <div className="text-xs text-[var(--muted-2)] truncate">{s.contact.email}</div>
                    </div>
                    <StageBadge stage={s.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pipeline funnel */}
        <section className="card overflow-hidden">
          <SectionHeader
            icon={<TrendingUp size={14} />}
            title="Pipeline"
            action={{ href: "/pipeline", label: "See all" }}
          />
          <div className="px-5 py-4 space-y-2.5">
            {FUNNEL_STAGES.map((stage) => {
              const count = stageMap.get(stage.key) ?? 0;
              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <span className="w-[130px] shrink-0 text-xs text-[var(--muted)]">{stage.label}</span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: "var(--bg)" }}>
                    <div
                      className="h-full rounded-md transition-all"
                      style={{
                        width: `${Math.max(count > 0 ? 4 : 0, (count / funnelMax) * 100)}%`,
                        background: stage.key === "DEAL" ? "var(--success-fg)" : "var(--brand-teal)",
                      }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-right text-xs font-semibold text-[var(--ink)]">{count}</span>
                </div>
              );
            })}
            <div className="pt-2 mt-1 border-t border-[var(--border)] flex justify-between text-xs">
              <span className="text-[var(--muted)]">Deals closed</span>
              <span className="font-semibold" style={{ color: "var(--success-fg)" }}>{deals}</span>
            </div>
          </div>
        </section>

        {/* Results, merged in from what used to be its own page */}
        <section className="card overflow-hidden">
          <SectionHeader icon={<TrendingUp size={14} />} title="Results" />
          <div className="px-5 py-4 space-y-4">
            <ResultsRow label="Brands" r={brand} />
            <ResultsRow label="Creators" r={creator} />
            <div className="pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Replied after #1" value={brand.byFollowUp[0] + creator.byFollowUp[0]} />
              <MiniStat label="After #2" value={brand.byFollowUp[1] + creator.byFollowUp[1]} />
              <MiniStat label="After #3" value={brand.byFollowUp[2] + creator.byFollowUp[2]} />
            </div>
          </div>
        </section>

        {/* What's about to go out + anything broken */}
        <section className="card overflow-hidden">
          <SectionHeader icon={<Clock size={14} />} title="Going out next" action={{ href: "/scheduled", label: "Schedule" }} />
          {upcoming.length === 0 ? (
            <Empty text="Nothing queued." />
          ) : (
            <ul>
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/dashboard/${a.sequence.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 border-t border-[var(--border)] hover:bg-[var(--bg)] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--ink)] truncate">{companyOrCreatorName(a.sequence.contact)}</div>
                      <div className="text-xs text-[var(--muted-2)]">Follow-up #{a.step}</div>
                    </div>
                    <span className="text-xs text-[var(--muted-2)] shrink-0 whitespace-nowrap">
                      {formatDateTime(a.scheduledAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {problems.length > 0 && (
            <>
              <div
                className="flex items-center gap-1.5 px-5 py-2 border-t border-[var(--border)] text-xs font-semibold uppercase tracking-wide"
                style={{ background: "var(--danger-bg)", color: "var(--danger-fg)" }}
              >
                <AlertTriangle size={12} /> Needs attention
              </div>
              <ul>
                {problems.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/dashboard/${s.id}`}
                      className="flex items-center gap-3 px-5 py-2.5 border-t border-[var(--border)] hover:bg-[var(--bg)] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[var(--ink)] truncate">{companyOrCreatorName(s.contact)}</div>
                        <div className="text-xs text-[var(--muted-2)] truncate">{s.contact.email}</div>
                      </div>
                      <span className="text-xs font-medium shrink-0" style={{ color: "var(--danger-fg)" }}>
                        {s.status === "BOUNCED" ? "Bounced" : "Opted out"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <h2 className="flex items-center gap-2 font-semibold text-sm text-[var(--ink)]">
        <span className="text-[var(--muted-2)]">{icon}</span>
        {title}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--brand-teal-dark)" }}
        >
          {action.label} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  href?: string;
  tone?: "default" | "accent";
}) {
  const inner = (
    <div
      className="card p-4 h-full transition-colors"
      style={tone === "accent" ? { borderColor: "var(--brand-teal)" } : undefined}
    >
      <div
        className="text-[26px] font-semibold tracking-tight leading-none"
        style={{ color: tone === "accent" ? "var(--brand-teal-dark)" : "var(--ink)" }}
      >
        {value}
      </div>
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

function ResultsRow({ label, r }: { label: string; r: Awaited<ReturnType<typeof resultsFor>> }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
        <span className="text-xs text-[var(--muted-2)]">
          {r.replied} of {r.total} replied · {r.bounced} bounced
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, r.replyRate)}%`, background: "var(--brand-teal)" }}
        />
      </div>
      <div className="text-[11px] text-[var(--muted-2)] mt-1">{r.replyRate.toFixed(1)}% reply rate</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold text-[var(--ink)] leading-none">{value}</div>
      <div className="text-[11px] text-[var(--muted-2)] mt-1">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-[var(--muted-2)] border-t border-[var(--border)]">{text}</p>;
}
