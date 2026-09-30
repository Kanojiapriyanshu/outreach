import Link from "next/link";
import { Suspense } from "react";
import { Plus, Download, ExternalLink, MessageSquareReply, Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";
import { StageBadge } from "@/app/components/Badge";
import { formatMoney, formatRate, parseStoredRates } from "@/lib/creatorReplyAnalysis";
import {
  INFLUENCER_VIEWS,
  REPLIED_WHERE,
  influencerSearchWhere,
  influencerViewWhere,
  parseInfluencerView,
  replyIntentLabel,
  type InfluencerView,
} from "@/lib/influencerOutreach";
import type { Prisma } from "@/app/generated/prisma/client";
import { Avatar, EmptyState, Kpi, KpiGrid, PageHeader, Pager, SendDots, ViewPills } from "@/app/components/ui";
import ListSearch from "@/app/components/ListSearch";
import MarkHandledButton from "@/app/components/MarkHandledButton";
import InfluencerTabs from "./InfluencerTabs";

// Reply and follow-up state changes every worker tick — never serve a cached copy.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const CREATOR_BASE: Prisma.OutreachSequenceWhereInput = { outreachType: "CREATOR", deletedAt: null };
const STEP_LABELS = ["Email 1", "Follow-up 1", "Follow-up 2", "Follow-up 3"];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default async function InfluencerOutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; page?: string }>;
}) {
  const { view: rawView, q, page: rawPage } = await searchParams;
  const view = parseInfluencerView(rawView);
  const page = Math.max(1, Number(rawPage) || 1);
  const listWhere: Prisma.OutreachSequenceWhereInput = {
    AND: [CREATOR_BASE, influencerViewWhere(view), influencerSearchWhere(q)],
  };

  const [total, replied, viewCounts, repliedSteps, usdRates, filteredCount, sequences] = await Promise.all([
    prisma.outreachSequence.count({ where: CREATOR_BASE }),
    prisma.outreachSequence.count({ where: { AND: [CREATOR_BASE, REPLIED_WHERE] } }),
    Promise.all(
      INFLUENCER_VIEWS.map((v) => prisma.outreachSequence.count({ where: { AND: [CREATOR_BASE, influencerViewWhere(v.key)] } }))
    ),
    prisma.outreachSequence.groupBy({
      by: ["repliedAfterStep"],
      where: { AND: [CREATOR_BASE, { repliedAfterStep: { not: null } }] },
      _count: true,
    }),
    prisma.outreachSequence.findMany({
      where: { AND: [CREATOR_BASE, { quotedRateCurrency: "USD", quotedRateAmount: { not: null } }] },
      select: { quotedRateAmount: true },
    }),
    prisma.outreachSequence.count({ where: listWhere }),
    prisma.outreachSequence.findMany({
      where: listWhere,
      include: {
        contact: { include: { creator: true } },
        scheduledActions: { where: { status: "PENDING" }, orderBy: { scheduledAt: "asc" }, take: 1 },
        messages: { where: { direction: "OUT" }, orderBy: { sentAt: "asc" }, select: { sentAt: true, source: true } },
      },
      // Replies waiting on the team float to the top of every view.
      orderBy: [{ awaitingResponseSince: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const countFor = (key: InfluencerView) => viewCounts[INFLUENCER_VIEWS.findIndex((v) => v.key === key)];
  const replyRate = total > 0 ? (replied / total) * 100 : 0;
  const medianUsd = median(usdRates.map((r) => r.quotedRateAmount!));
  const stepCount = (step: number) => repliedSteps.find((s) => s.repliedAfterStep === step)?._count ?? 0;
  const viewHref = (key: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ ...(key !== "all" ? { view: key } : {}), ...(q ? { q } : {}), ...extra });
    return `/influencers${params.size ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        workspace="influencers"
        section="Outreach"
        title="Influencer outreach"
        description="Every creator you've pitched — who replied, what they quoted, and who's still being followed up."
        actions={
          <>
            <a href={`/api/influencers/export?${new URLSearchParams({ view, ...(q ? { q } : {}) }).toString()}`} className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
              <Download size={15} /> Export
            </a>
            <Link href="/track?outreachType=CREATOR" className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
              <Plus size={16} /> Pitch a creator
            </Link>
          </>
        }
      />

      <InfluencerTabs active="outreach" counts={{ outreach: countFor("needs-response") }} />

      <KpiGrid columns={5}>
        <Kpi label="Creators contacted" value={total} href="/influencers" hint={`${countFor("following-up")} still being followed up`} />
        <Kpi label="Replied" value={replied} hint={`${replyRate.toFixed(0)}% reply rate`} />
        <Kpi
          label="Needs your reply"
          value={countFor("needs-response")}
          href={viewHref("needs-response")}
          tone={countFor("needs-response") > 0 ? "accent" : "default"}
          hint={countFor("needs-response") > 0 ? "Oldest first in the list below" : "You're all caught up"}
        />
        <Kpi
          label="Rates received"
          value={countFor("rates")}
          href={viewHref("rates")}
          tone={countFor("rates") > 0 ? "success" : "default"}
          hint={medianUsd !== null ? `Median ${formatMoney(medianUsd, "USD")}` : undefined}
        />
        <Kpi label="Interested, no rate yet" value={countFor("interested")} href={viewHref("interested")} hint={`${countFor("declined")} declined · ${countFor("bounced")} bounced`} />
      </KpiGrid>

      {replied > 0 && (
        <div className="card px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">First replied after</span>
          {STEP_LABELS.map((label, step) => (
            <span key={label} className="text-[var(--muted)]">
              {label} <span className="font-semibold text-[var(--ink)] tabular">{stepCount(step)}</span>
            </span>
          ))}
          <Link href={viewHref("no-reply")} className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--ink)]">
            {countFor("no-reply")} never replied →
          </Link>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <ViewPills active={view} items={INFLUENCER_VIEWS.map((v) => ({ key: v.key, label: v.label, count: countFor(v.key), href: viewHref(v.key) }))} />
        <Suspense fallback={<div className="h-10" />}>
          <ListSearch placeholder="Search creator, channel or email…" />
        </Suspense>
      </div>

      <div className="card overflow-hidden overflow-x-auto scroll-slim">
        {sequences.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={18} />}
            title={total === 0 ? "No creators pitched yet" : "Nobody matches this view"}
            body={total === 0 ? "Pitch a creator, or use Start Outreach from Discovery — replies and rates show up here." : "Try another filter, or clear the search."}
            action={
              total === 0 ? (
                <Link href="/track?outreachType=CREATOR" className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
                  <Plus size={15} /> Pitch a creator
                </Link>
              ) : undefined
            }
          />
        ) : (
          <table className="data-table table-fixed min-w-[1000px]">
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Emails</th>
                <th>Their reply</th>
                <th>Rate</th>
                <th>Stage</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq) => {
                const creator = seq.contact.creator;
                const awaiting = !!seq.awaitingResponseSince;
                const systemSends = seq.messages.filter((m) => m.source === "SYSTEM");
                const manualSends = seq.messages.length - systemSends.length;
                const rates = parseStoredRates(seq.quotedRates);
                const hasReplied = !!seq.lastReplyAt || seq.status === "REPLIED" || seq.status === "UNSUBSCRIBED";
                const pending = seq.scheduledActions[0];
                const name = creator?.name ?? seq.contact.name;

                return (
                  <tr key={seq.id} style={awaiting ? { background: "var(--influencers-accent-light)", boxShadow: "inset 3px 0 0 var(--influencers-accent)" } : undefined}>
                    <td>
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Avatar name={name} src={creator?.thumbnailUrl} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/dashboard/${seq.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)] truncate">
                              {name}
                            </Link>
                            {creator?.channelUrl && (
                              <a href={creator.channelUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--muted-2)] hover:text-[var(--ink)] shrink-0" title="Open channel">
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-[var(--muted-2)] truncate">{seq.contact.email}</div>
                          {creator?.subscriberCount != null && (
                            <div className="text-xs text-[var(--muted-2)] tabular">{creator.subscriberCount.toLocaleString("en-US")} subscribers</div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <SendDots sent={systemSends} labels={STEP_LABELS} />
                      <div className="text-xs text-[var(--muted-2)] mt-1.5 whitespace-nowrap">
                        {systemSends.length <= 1 ? "Email 1 only" : `Email 1 + ${Math.min(systemSends.length - 1, 3)} follow-up${systemSends.length > 2 ? "s" : ""}`}
                        {systemSends.length > 4 && ` + ${systemSends.length - 4} check-in${systemSends.length > 5 ? "s" : ""}`}
                      </div>
                      {manualSends > 0 && <div className="text-xs text-[var(--muted-2)] whitespace-nowrap">You wrote {manualSends}×</div>}
                    </td>

                    <td>
                      {hasReplied ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {awaiting && (
                              <span className="badge" style={{ background: "var(--influencers-accent)", color: "#fff" }}>
                                <MessageSquareReply size={11} /> Needs your reply
                              </span>
                            )}
                            <span className="text-xs font-medium text-[var(--ink)]">{replyIntentLabel(seq.replyIntent)}</span>
                            {seq.lastReplyAt && <span className="text-xs text-[var(--muted-2)]">{formatDateTime(seq.lastReplyAt)}</span>}
                          </div>
                          {(seq.replySummary || seq.lastReplyText) && (
                            <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2 break-words">{seq.replySummary ?? seq.lastReplyText}</p>
                          )}
                          {awaiting && (
                            <div className="mt-2">
                              <MarkHandledButton sequenceId={seq.id} compact />
                            </div>
                          )}
                        </>
                      ) : seq.status === "BOUNCED" ? (
                        <span className="text-xs" style={{ color: "var(--danger-fg)" }}>
                          Email bounced
                        </span>
                      ) : seq.status === "COMPLETED" ? (
                        <span className="text-xs text-[var(--muted-2)]">No reply — all follow-ups sent</span>
                      ) : (
                        <span className="text-xs text-[var(--muted-2)]">No reply yet</span>
                      )}
                    </td>

                    <td>
                      {seq.quotedRateAmount !== null ? (
                        <div>
                          <div className="font-semibold text-[var(--ink)] tabular">
                            {formatRate({ amount: seq.quotedRateAmount, amountMax: rates[0]?.amountMax ?? null, currency: seq.quotedRateCurrency, deliverable: null }, false)}
                          </div>
                          <div className="text-xs text-[var(--muted-2)]">
                            {rates.find((r) => r.amount === seq.quotedRateAmount)?.deliverable ?? "Deliverable not stated"}
                            {rates.length > 1 && ` · +${rates.length - 1} more`}
                          </div>
                        </div>
                      ) : seq.rateNote ? (
                        <span className="text-xs text-[var(--ink)]">Rate card shared</span>
                      ) : (
                        <span className="text-[var(--muted-2)]">—</span>
                      )}
                    </td>

                    <td>
                      <StageBadge stage={seq.stage} />
                    </td>

                    <td className="text-xs text-[var(--muted)]">
                      {pending ? (
                        <>
                          <div className="text-[var(--ink)]">{pending.kind === "TEMPLATE" ? `Follow-up #${pending.step}` : `Check-in #${pending.step}`}</div>
                          <div>{formatDateTime(pending.scheduledAt)}</div>
                        </>
                      ) : seq.status === "PAUSED" ? (
                        "Paused"
                      ) : hasReplied ? (
                        "Follow-ups stopped"
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pager page={page} pageSize={PAGE_SIZE} total={filteredCount} href={(p) => viewHref(view, { page: String(p) })} />
    </div>
  );
}

