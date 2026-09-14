import Link from "next/link";
import { Suspense } from "react";
import { Plus, Download, ExternalLink, MessageSquareReply } from "lucide-react";
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
import InfluencerSearch from "./InfluencerSearch";
import MarkHandledButton from "./MarkHandledButton";

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Influencer Outreach</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Every creator you&apos;ve pitched — who replied, what they quoted, and who&apos;s still being followed up.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/influencers/export?${new URLSearchParams({ view, ...(q ? { q } : {}) }).toString()}`}
            className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm"
          >
            <Download size={15} /> Export CSV
          </a>
          <Link href="/track?outreachType=CREATOR" className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm">
            <Plus size={16} /> Pitch a Creator
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Creators contacted" value={total} href="/influencers" />
        <StatCard label={`Replied · ${replyRate.toFixed(0)}% reply rate`} value={replied} />
        <StatCard
          label="Need your reply"
          value={countFor("needs-response")}
          href="/influencers?view=needs-response"
          tone={countFor("needs-response") > 0 ? "accent" : "default"}
        />
        <StatCard
          label={medianUsd !== null ? `Rates received · median ${formatMoney(medianUsd, "USD")}` : "Rates received"}
          value={countFor("rates")}
          href="/influencers?view=rates"
        />
        <StatCard label="Still following up" value={countFor("following-up")} href="/influencers?view=following-up" />
        <StatCard label="No reply after all follow-ups" value={countFor("no-reply")} href="/influencers?view=no-reply" />
        <StatCard label="Declined or opted out" value={countFor("declined")} href="/influencers?view=declined" />
        <StatCard label="Bounced" value={countFor("bounced")} href="/influencers?view=bounced" />
      </div>

      {replied > 0 && (
        <div className="card px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">First replied after</span>
          {STEP_LABELS.map((label, step) => (
            <span key={label} className="text-[var(--muted)]">
              {label}: <span className="font-semibold text-[var(--ink)]">{stepCount(step)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {INFLUENCER_VIEWS.map((v) => {
            const active = v.key === view;
            const params = new URLSearchParams({ ...(v.key !== "all" ? { view: v.key } : {}), ...(q ? { q } : {}) });
            return (
              <Link
                key={v.key}
                href={`/influencers${params.size ? `?${params.toString()}` : ""}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
                style={
                  active
                    ? { background: "var(--ink)", color: "var(--ink-inverse)" }
                    : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
                }
              >
                {v.label}
                <span className="opacity-70">{countFor(v.key)}</span>
              </Link>
            );
          })}
        </div>
        <Suspense fallback={<div className="h-10" />}>
          <InfluencerSearch />
        </Suspense>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="text-[var(--muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <Th>Creator</Th>
              <Th>Emails sent</Th>
              <Th>Their reply</Th>
              <Th>Rate</Th>
              <Th>Stage</Th>
              <Th>Next</Th>
            </tr>
          </thead>
          <tbody>
            {sequences.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-14 text-center text-[var(--muted-2)] text-sm">
                  {total === 0 ? (
                    <>
                      No creators pitched yet —{" "}
                      <Link href="/track?outreachType=CREATOR" className="underline">
                        send the first one
                      </Link>{" "}
                      or use Start Outreach from Discovery.
                    </>
                  ) : (
                    "Nobody matches this filter."
                  )}
                </td>
              </tr>
            )}
            {sequences.map((seq) => {
              const creator = seq.contact.creator;
              const awaiting = !!seq.awaitingResponseSince;
              const systemSends = seq.messages.filter((m) => m.source === "SYSTEM");
              const manualSends = seq.messages.length - systemSends.length;
              const rates = parseStoredRates(seq.quotedRates);
              const hasReplied = !!seq.lastReplyAt || seq.status === "REPLIED" || seq.status === "UNSUBSCRIBED";
              const pending = seq.scheduledActions[0];

              return (
                <tr
                  key={seq.id}
                  className="border-b border-[var(--border)] last:border-0 align-top transition-colors hover:bg-[var(--bg)]"
                  style={awaiting ? { background: "var(--brand-teal-light)", boxShadow: "inset 3px 0 0 var(--brand-teal)" } : undefined}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2.5 min-w-[190px]">
                      {creator?.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar, same as Discovery
                        <img src={creator.thumbnailUrl} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold"
                          style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}
                        >
                          {(creator?.name ?? seq.contact.name).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/dashboard/${seq.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)] truncate">
                            {creator?.name ?? seq.contact.name}
                          </Link>
                          {creator?.channelUrl && (
                            <a
                              href={creator.channelUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--muted-2)] hover:text-[var(--ink)] shrink-0"
                              title="Open channel"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-[var(--muted-2)] truncate">{seq.contact.email}</div>
                        {creator?.subscriberCount != null && (
                          <div className="text-xs text-[var(--muted-2)]">{creator.subscriberCount.toLocaleString("en-US")} subscribers</div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1" aria-label={`${systemSends.length} automated emails sent`}>
                      {STEP_LABELS.map((label, i) => {
                        const sent = systemSends[i];
                        return (
                          <span
                            key={label}
                            title={sent ? `${label} — sent ${formatDateTime(sent.sentAt)}` : `${label} — not sent`}
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                              background: sent ? "var(--brand-teal)" : "transparent",
                              border: `1.5px solid ${sent ? "var(--brand-teal)" : "var(--border)"}`,
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="text-xs text-[var(--muted-2)] mt-1.5 whitespace-nowrap">
                      {systemSends.length <= 1
                        ? "Email 1 only"
                        : `Email 1 + ${Math.min(systemSends.length - 1, 3)} follow-up${systemSends.length > 2 ? "s" : ""}`}
                      {systemSends.length > 4 && ` + ${systemSends.length - 4} check-in${systemSends.length > 5 ? "s" : ""}`}
                    </div>
                    {manualSends > 0 && (
                      <div className="text-xs text-[var(--muted-2)] whitespace-nowrap">
                        You wrote {manualSends}×
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3.5 max-w-[320px]">
                    {hasReplied ? (
                      <>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {awaiting && (
                            <span className="badge inline-flex items-center gap-1" style={{ background: "var(--brand-teal)", color: "#fff" }}>
                              <MessageSquareReply size={11} /> Needs your reply
                            </span>
                          )}
                          <span className="text-xs font-medium text-[var(--ink)]">{replyIntentLabel(seq.replyIntent)}</span>
                          {seq.lastReplyAt && <span className="text-xs text-[var(--muted-2)]">{formatDateTime(seq.lastReplyAt)}</span>}
                        </div>
                        {(seq.replySummary || seq.lastReplyText) && (
                          <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2 break-words">
                            {seq.replySummary ?? seq.lastReplyText}
                          </p>
                        )}
                        {/* Kept beside the reply rather than in a trailing column, which a laptop-width
                            table scrolls out of view. */}
                        {awaiting && (
                          <div className="mt-2">
                            <MarkHandledButton sequenceId={seq.id} compact />
                          </div>
                        )}
                      </>
                    ) : seq.status === "BOUNCED" ? (
                      <span className="text-xs" style={{ color: "var(--danger-fg)" }}>Email bounced</span>
                    ) : seq.status === "COMPLETED" ? (
                      <span className="text-xs text-[var(--muted-2)]">No reply — all follow-ups sent</span>
                    ) : (
                      <span className="text-xs text-[var(--muted-2)]">No reply yet</span>
                    )}
                  </td>

                  <td className="px-4 py-3.5">
                    {seq.quotedRateAmount !== null ? (
                      <div className="whitespace-nowrap">
                        <div className="font-semibold text-[var(--ink)]">
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

                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <StageBadge stage={seq.stage} />
                  </td>

                  <td className="px-4 py-3.5 text-xs text-[var(--muted)] whitespace-nowrap">
                    {pending ? (
                      <>
                        <div className="text-[var(--ink)]">
                          {pending.kind === "TEMPLATE" ? `Follow-up #${pending.step}` : `Check-in #${pending.step}`}
                        </div>
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
      </div>

      <Pagination page={page} totalCount={filteredCount} view={view} q={q} />
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">{children}</th>;
}

function StatCard({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "default" | "accent";
}) {
  const inner = (
    <div className="card p-4 h-full" style={tone === "accent" ? { borderColor: "var(--brand-teal)" } : undefined}>
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

function Pagination({ page, totalCount, view, q }: { page: number; totalCount: number; view: InfluencerView; q?: string }) {
  if (totalCount <= PAGE_SIZE) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalCount);
  const href = (p: number) =>
    `/influencers?${new URLSearchParams({ ...(view !== "all" ? { view } : {}), ...(q ? { q } : {}), page: String(p) }).toString()}`;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
      <span className="text-[var(--muted)]">
        {start}–{end} of {totalCount}
      </span>
      <div className="flex gap-2">
        <Link
          href={href(page - 1)}
          aria-disabled={page <= 1}
          className={`btn-secondary px-3 py-1.5 text-xs ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
        >
          ← Newer
        </Link>
        <Link
          href={href(page + 1)}
          aria-disabled={end >= totalCount}
          className={`btn-secondary px-3 py-1.5 text-xs ${end >= totalCount ? "pointer-events-none opacity-40" : ""}`}
        >
          Older →
        </Link>
      </div>
    </div>
  );
}
