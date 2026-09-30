import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, Clock, Eye, Megaphone, MessageSquareReply } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { companyOrCreatorName } from "@/lib/display";
import { businessHour, formatAgo, formatDateTime } from "@/lib/formatDate";
import { formatRate } from "@/lib/creatorReplyAnalysis";
import { BRAND_BASE, BRAND_REPLIED_WHERE, brandReplyLabel } from "@/lib/brandOutreach";
import { REPLIED_WHERE, replyIntentLabel } from "@/lib/influencerOutreach";
import { PUBLIC_ROSTER_WHERE } from "@/lib/publicRosterRules";
import { StageBadge } from "@/app/components/Badge";
import { Avatar, Kpi, KpiGrid, PageHeader, Panel } from "@/app/components/ui";
import type { Prisma } from "@/app/generated/prisma/client";

// Always render fresh — a dashboard showing numbers frozen at build time would be actively
// misleading, which is exactly the bug this project hit on /activity and /analytics before.
export const dynamic = "force-dynamic";

const CREATOR_BASE: Prisma.OutreachSequenceWhereInput = { outreachType: "CREATOR", deletedAt: null };
const WAITING: Prisma.OutreachSequenceWhereInput = { awaitingResponseSince: { not: null } };

function greeting(): string {
  const hour = businessHour();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const count = (where: Prisma.OutreachSequenceWhereInput) => prisma.outreachSequence.count({ where });

/**
 * Home: what needs the team today, split the way the work is — brands on one side, influencers on
 * the other — with the shared mail and schedule underneath.
 */
export default async function HomePage() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [
    unreadMail,
    dueToday,
    brandWaiting,
    brandWaitingCount,
    brandTotal,
    brandReplied,
    brandWantsCreators,
    brandInTalks,
    deals,
    creatorWaiting,
    creatorWaitingCount,
    creatorTotal,
    creatorReplied,
    ratesReceived,
    interested,
    rosterSize,
    upcoming,
    problems,
    sheetViews,
  ] = await Promise.all([
    prisma.inboxThread.count({ where: { isUnread: true, isArchived: false, isTrashed: false } }),
    prisma.scheduledAction.count({
      where: { status: "PENDING", scheduledAt: { gte: startOfToday, lt: endOfToday }, sequence: { deletedAt: null } },
    }),
    prisma.outreachSequence.findMany({
      where: { AND: [BRAND_BASE, WAITING] },
      orderBy: { awaitingResponseSince: "asc" },
      take: 5,
      include: {
        contact: { include: { brand: true } },
        inboxThreads: { take: 1, select: { messages: { where: { direction: "IN" }, orderBy: { sentAt: "desc" }, take: 1, select: { snippet: true } } } },
      },
    }),
    count({ AND: [BRAND_BASE, WAITING] }),
    count(BRAND_BASE),
    count({ AND: [BRAND_BASE, BRAND_REPLIED_WHERE] }),
    count({ AND: [BRAND_BASE, { stage: { in: ["CREATOR_LIST_REQUESTED", "CREATOR_LIST_SENT"] } }] }),
    count({ AND: [BRAND_BASE, { stage: { in: ["NEGOTIATION", "CREATOR_SELECTED"] } }] }),
    count({ AND: [BRAND_BASE, { stage: "DEAL" }] }),
    prisma.outreachSequence.findMany({
      where: { AND: [CREATOR_BASE, WAITING] },
      orderBy: { awaitingResponseSince: "asc" },
      take: 5,
      include: { contact: { include: { creator: true } } },
    }),
    count({ AND: [CREATOR_BASE, WAITING] }),
    count(CREATOR_BASE),
    count({ AND: [CREATOR_BASE, REPLIED_WHERE] }),
    count({ AND: [CREATOR_BASE, { quotedRateAt: { not: null } }] }),
    count({ AND: [CREATOR_BASE, { stage: "INTERESTED" }] }),
    prisma.creator.count({ where: PUBLIC_ROSTER_WHERE }),
    prisma.scheduledAction.findMany({
      where: { status: "PENDING", sequence: { deletedAt: null } },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      include: { sequence: { include: { contact: { include: { brand: true, creator: true } } } } },
    }),
    prisma.outreachSequence.findMany({
      where: { deletedAt: null, status: { in: ["BOUNCED", "UNSUBSCRIBED"] }, updatedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: { contact: { include: { brand: true, creator: true } } },
    }),
    prisma.pitchSheet.findMany({
      where: { lastViewedAt: { not: null } },
      orderBy: { lastViewedAt: "desc" },
      take: 4,
      select: { id: true, brandName: true, viewCount: true, lastViewedAt: true, _count: { select: { items: true } } },
    }),
  ]);

  const waitingTotal = brandWaitingCount + creatorWaitingCount;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-7">
      <PageHeader
        title={greeting()}
        description={
          waitingTotal > 0
            ? `${today} — ${waitingTotal} ${waitingTotal === 1 ? "reply is" : "replies are"} waiting on you. Oldest first below.`
            : `${today} — no replies waiting on you. Nice.`
        }
      />

      <KpiGrid columns={5}>
        <Kpi label="Waiting on your reply" value={waitingTotal} tone={waitingTotal > 0 ? "accent" : "default"} hint={`${brandWaitingCount} brands · ${creatorWaitingCount} creators`} />
        <Kpi label="Unread mail" value={unreadMail} href="/inbox" />
        <Kpi label="Emails going out today" value={dueToday} href="/scheduled" />
        <Kpi label="Creators on the public roster" value={rosterSize} href="/influencers/roster" />
        <Kpi label="Brand deals" value={deals} href="/brands?view=deals" tone={deals > 0 ? "success" : "default"} hint={`${brandInTalks} in talks`} />
      </KpiGrid>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <WorkspaceColumn
          kind="brands"
          title="Brands"
          href="/brands"
          icon={<Building2 size={15} />}
          stats={[
            { label: "Contacted", value: brandTotal },
            { label: "Replied", value: brandReplied, hint: pct(brandReplied, brandTotal) },
            { label: "Want creators", value: brandWantsCreators },
            { label: "In talks", value: brandInTalks },
          ]}
          waitingCount={brandWaitingCount}
          waitingHref="/brands?view=needs-response"
          empty="No brand replies waiting. Every answer has been handled."
          rows={brandWaiting.map((s) => ({
            id: s.id,
            name: companyOrCreatorName(s.contact) === "—" ? s.contact.name : companyOrCreatorName(s.contact),
            detail: s.lastReplyText ?? s.inboxThreads[0]?.messages[0]?.snippet ?? s.contact.email,
            label: brandReplyLabel(s.replyIntent),
            since: s.awaitingResponseSince!,
            stage: s.stage,
            avatar: null,
          }))}
        />
        <WorkspaceColumn
          kind="influencers"
          title="Influencers"
          href="/influencers"
          icon={<Megaphone size={15} />}
          stats={[
            { label: "Contacted", value: creatorTotal },
            { label: "Replied", value: creatorReplied, hint: pct(creatorReplied, creatorTotal) },
            { label: "Rates received", value: ratesReceived },
            { label: "Interested", value: interested },
          ]}
          waitingCount={creatorWaitingCount}
          waitingHref="/influencers?view=needs-response"
          empty="No creator replies waiting. Every answer has been handled."
          rows={creatorWaiting.map((s) => ({
            id: s.id,
            name: s.contact.creator?.name ?? s.contact.name,
            detail: s.replySummary ?? s.lastReplyText ?? s.contact.email,
            label:
              s.quotedRateAmount !== null
                ? formatRate({ amount: s.quotedRateAmount, amountMax: null, currency: s.quotedRateCurrency, deliverable: null }, false)
                : replyIntentLabel(s.replyIntent),
            since: s.awaitingResponseSince!,
            stage: s.stage,
            avatar: s.contact.creator?.thumbnailUrl ?? null,
          }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Going out next" icon={<Clock size={14} />} action={{ href: "/scheduled", label: "Schedule" }} className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--muted-2)]">Nothing queued.</p>
          ) : (
            <ul>
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link href={`/dashboard/${a.sequence.id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors">
                    <span
                      className="badge"
                      style={
                        a.sequence.outreachType === "BRAND"
                          ? { background: "var(--brands-accent-light)", color: "var(--brands-accent)" }
                          : { background: "var(--influencers-accent-light)", color: "var(--influencers-accent)" }
                      }
                    >
                      {a.sequence.outreachType === "BRAND" ? "Brand" : "Creator"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--ink)] truncate">{companyOrCreatorName(a.sequence.contact)}</div>
                    </div>
                    <span className="text-xs text-[var(--muted)] whitespace-nowrap">{a.kind === "TEMPLATE" ? `Follow-up #${a.step}` : `Nudge #${a.step}`}</span>
                    <span className="text-xs text-[var(--muted-2)] whitespace-nowrap tabular w-[150px] text-right">{formatDateTime(a.scheduledAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Pitch sheets opened" icon={<Eye size={14} />} action={{ href: "/brands/pitch-sheets", label: "All sheets" }}>
            {sheetViews.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-[var(--muted-2)]">No brand has opened a sheet yet.</p>
            ) : (
              <ul>
                {sheetViews.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[var(--ink)] truncate">{s.brandName}</div>
                      <div className="text-xs text-[var(--muted-2)]">
                        {s._count.items} creators · {s.viewCount} view{s.viewCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--muted-2)] whitespace-nowrap">{formatAgo(s.lastViewedAt!)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {problems.length > 0 && (
            <Panel title="Needs attention" icon={<AlertTriangle size={14} />}>
              <ul>
                {problems.map((s) => (
                  <li key={s.id}>
                    <Link href={`/dashboard/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors">
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
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

interface WaitingRow {
  id: string;
  name: string;
  detail: string;
  label: string;
  since: Date;
  stage: string;
  avatar: string | null;
}

function WorkspaceColumn({
  kind,
  title,
  href,
  icon,
  stats,
  waitingCount,
  waitingHref,
  rows,
  empty,
}: {
  kind: "brands" | "influencers";
  title: string;
  href: string;
  icon: React.ReactNode;
  stats: { label: string; value: number; hint?: string }[];
  waitingCount: number;
  waitingHref: string;
  rows: WaitingRow[];
  empty: string;
}) {
  const accent = kind === "brands" ? "var(--brands-accent)" : "var(--influencers-accent)";
  const accentLight = kind === "brands" ? "var(--brands-accent-light)" : "var(--influencers-accent-light)";
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
        <h2 className="flex items-center gap-2 font-semibold text-[14px] text-[var(--ink)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: accentLight, color: accent }}>
            {icon}
          </span>
          {title}
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--brand-teal-dark)" }}>
          Open {title.toLowerCase()} <ArrowRight size={12} />
        </Link>
      </div>
      <div className="grid grid-cols-4 border-b border-[var(--border)]">
        {stats.map((s, i) => (
          <div key={s.label} className={`px-4 py-3 ${i > 0 ? "border-l border-[var(--border)]" : ""}`}>
            <div className="text-[18px] font-semibold text-[var(--ink)] tabular leading-none">{s.value}</div>
            <div className="text-[11.5px] text-[var(--muted)] mt-1.5 truncate">
              {s.label}
              {s.hint && <span className="text-[var(--muted-2)]"> · {s.hint}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-5 pt-3.5 pb-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: waitingCount > 0 ? accent : "var(--muted-2)" }}>
          <MessageSquareReply size={13} /> Waiting on your reply · {waitingCount}
        </span>
        {waitingCount > rows.length && (
          <Link href={waitingHref} className="text-xs text-[var(--muted)] hover:text-[var(--ink)]">
            See all →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-6 pt-3 text-sm text-[var(--muted-2)]">{empty}</p>
      ) : (
        <ul className="pb-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/${r.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface-2)] transition-colors">
                <Avatar name={r.name} src={r.avatar} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-[var(--ink)] truncate">{r.name}</span>
                    <span className="text-xs font-medium shrink-0" style={{ color: accent }}>
                      {r.label}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted-2)] truncate">{r.detail}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StageBadge stage={r.stage} />
                  <span className="text-[11px] text-[var(--muted-2)]">{formatAgo(r.since)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
