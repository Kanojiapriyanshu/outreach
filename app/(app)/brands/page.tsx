import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Building2, Download, ExternalLink, Link2, MessageSquareReply, Plus, Sparkles } from "lucide-react";
import { appBaseUrl } from "@/lib/pitchSheetServer";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";
import { budgetLabel, gmailThreadLink, influencerRangeLabel } from "@/lib/display";
import { StageBadge } from "@/app/components/Badge";
import { Avatar, EmptyState, Kpi, KpiGrid, PageHeader, Pager, SendDots, ViewPills } from "@/app/components/ui";
import ListSearch from "@/app/components/ListSearch";
import MarkHandledButton from "@/app/components/MarkHandledButton";
import StarToggle from "@/app/components/StarToggle";
import ReplyPanel from "@/app/components/ReplyPanel";
import { scheduledRepliesBySequence } from "@/lib/scheduledReplies";
import {
  BRAND_BASE,
  BRAND_REPLIED_WHERE,
  BRAND_VIEWS,
  brandReplyLabel,
  brandSearchWhere,
  brandViewWhere,
  parseBrandView,
  type BrandView,
} from "@/lib/brandOutreach";
import type { Prisma } from "@/app/generated/prisma/client";
import BrandTabs from "./BrandTabs";

// Reply and follow-up state changes every worker tick — never serve a cached copy.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STEP_LABELS = ["Email 1", "Follow-up 1", "Follow-up 2", "Follow-up 3"];

/** Where a brand is in the funnel, top to bottom — each step counts everyone who got at least that far. */
const FUNNEL: { label: string; where: Prisma.OutreachSequenceWhereInput }[] = [
  { label: "Contacted", where: {} },
  { label: "Replied", where: BRAND_REPLIED_WHERE },
  { label: "Wanted creators", where: { stage: { in: ["CREATOR_LIST_REQUESTED", "CREATOR_LIST_SENT", "NEGOTIATION", "CREATOR_SELECTED", "DEAL"] } } },
  { label: "In talks", where: { stage: { in: ["NEGOTIATION", "CREATOR_SELECTED", "DEAL"] } } },
  { label: "Deal", where: { stage: "DEAL" } },
];

export default async function BrandOutreachPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; page?: string }> }) {
  const { view: rawView, q, page: rawPage } = await searchParams;
  const view = parseBrandView(rawView);
  const page = Math.max(1, Number(rawPage) || 1);
  const listWhere: Prisma.OutreachSequenceWhereInput = { AND: [BRAND_BASE, brandViewWhere(view), brandSearchWhere(q)] };

  const [viewCounts, funnel, filteredCount, sequences] = await Promise.all([
    Promise.all(BRAND_VIEWS.map((v) => prisma.outreachSequence.count({ where: { AND: [BRAND_BASE, brandViewWhere(v.key)] } }))),
    Promise.all(FUNNEL.map((f) => prisma.outreachSequence.count({ where: { AND: [BRAND_BASE, f.where] } }))),
    prisma.outreachSequence.count({ where: listWhere }),
    prisma.outreachSequence.findMany({
      where: listWhere,
      include: {
        contact: { include: { brand: true } },
        scheduledActions: { where: { status: "PENDING" }, orderBy: { scheduledAt: "asc" }, take: 1 },
        messages: { where: { direction: "OUT" }, orderBy: { sentAt: "asc" }, select: { sentAt: true, source: true } },
        // Brand replies from before reply text was recorded still show — read from the inbox mirror.
        inboxThreads: {
          take: 1,
          select: { id: true, messages: { where: { direction: "IN" }, orderBy: { sentAt: "desc" }, take: 1, select: { snippet: true, sentAt: true } } },
        },
      },
      // Replies waiting on the team float to the top of every view.
      orderBy: [{ awaitingResponseSince: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const scheduledReplies = await scheduledRepliesBySequence();
  // Pitch sheets made for the brands on this page, matched by the brand's email or name, so a row
  // can show that a tailored shortlist went out and whether the brand has opened it.
  const sheets = await prisma.pitchSheet.findMany({
    where: {
      OR: [
        { brandEmail: { in: sequences.map((s) => s.contact.email), mode: "insensitive" } },
        { brandName: { in: sequences.flatMap((s) => (s.contact.brand?.name ? [s.contact.brand.name.trim()] : [])), mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { brandName: true, brandEmail: true, viewCount: true, lastViewedAt: true, createdAt: true },
  });
  const sheetFor = (email: string, brandName: string | null | undefined) =>
    sheets.find((p) => p.brandEmail?.toLowerCase() === email.toLowerCase()) ??
    (brandName ? sheets.find((p) => p.brandName.trim().toLowerCase() === brandName.trim().toLowerCase()) : undefined) ??
    null;
  const h = await headers();
  const rosterUrl = `${appBaseUrl(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`)}/roster`;
  const countFor = (key: BrandView) => viewCounts[BRAND_VIEWS.findIndex((v) => v.key === key)];
  const [total, replied] = funnel;
  const replyRate = total > 0 ? (replied / total) * 100 : 0;
  const viewHref = (key: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ ...(key !== "all" ? { view: key } : {}), ...(q ? { q } : {}), ...extra });
    return `/brands${params.size ? `?${params.toString()}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        workspace="brands"
        section="Outreach"
        title="Brand outreach"
        description="Every brand and agency you've pitched — who answered, who wants creators, and where each deal stands."
        actions={
          <>
            <a href={`/api/brands/export?${new URLSearchParams({ view, ...(q ? { q } : {}) }).toString()}`} className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
              <Download size={15} /> Export
            </a>
            <Link href="/track?outreachType=BRAND" className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
              <Plus size={16} /> Pitch a brand
            </Link>
          </>
        }
      />

      <BrandTabs active="outreach" counts={{ outreach: countFor("needs-response") }} />

      <KpiGrid columns={6}>
        <Kpi label="Brands contacted" value={total} href="/brands" />
        <Kpi label="Replied" value={replied} hint={`${replyRate.toFixed(0)}% reply rate`} />
        <Kpi
          label="Needs your reply"
          value={countFor("needs-response")}
          href={viewHref("needs-response")}
          tone={countFor("needs-response") > 0 ? "accent" : "default"}
          hint={countFor("needs-response") > 0 ? "Oldest first in the list below" : "You're all caught up"}
        />
        <Kpi label="Wants creators" value={countFor("wants-list")} href={viewHref("wants-list")} hint={countFor("wants-list") > 0 ? "Asked — nothing sent yet" : "Everyone who asked got creators"} />
        <Kpi label="Creators sent" value={countFor("list-sent")} href={viewHref("list-sent")} hint={`${countFor("roster-sent")} got the roster link`} />
        <Kpi label="Deals" value={countFor("deals")} href={viewHref("deals")} tone={countFor("deals") > 0 ? "success" : "default"} hint={`${countFor("in-talks")} in talks`} />
      </KpiGrid>

      {total > 0 && (
        <div className="card px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">Brand funnel</span>
            <span className="text-xs text-[var(--muted-2)]">
              {countFor("following-up")} still being followed up · {countFor("no-reply")} no reply · {countFor("declined")} declined · {countFor("bounced")} bounced
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {FUNNEL.map((f, i) => {
              const value = funnel[i];
              const pct = total > 0 ? (value / total) * 100 : 0;
              return (
                <div key={f.label}>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--neutral-bg)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(value > 0 ? 3 : 0, pct)}%`, background: i === FUNNEL.length - 1 ? "var(--success-fg)" : "var(--brands-accent)" }} />
                  </div>
                  <div className="mt-2 text-[15px] font-semibold text-[var(--ink)] tabular">{value}</div>
                  <div className="text-[11.5px] text-[var(--muted)]">
                    {f.label}
                    {i > 0 && <span className="text-[var(--muted-2)]"> · {pct.toFixed(0)}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <ViewPills active={view} items={BRAND_VIEWS.map((v) => ({ key: v.key, label: v.label, count: countFor(v.key), href: viewHref(v.key) }))} />
        <Suspense fallback={<div className="h-10" />}>
          <ListSearch placeholder="Search brand, contact or email…" />
        </Suspense>
      </div>

      <div className="card overflow-hidden overflow-x-auto scroll-slim">
        {sequences.length === 0 ? (
          <EmptyState
            icon={<Building2 size={18} />}
            title={total === 0 ? "No brands pitched yet" : "Nobody matches this view"}
            body={total === 0 ? "Send the first brand pitch and it'll be tracked here — replies, follow-ups and stage." : "Try another filter, or clear the search."}
            action={
              total === 0 ? (
                <Link href="/track?outreachType=BRAND" className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
                  <Plus size={15} /> Pitch a brand
                </Link>
              ) : undefined
            }
          />
        ) : (
          <table className="data-table table-fixed min-w-[1080px]">
            <colgroup>
              <col style={{ width: "23%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "29%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Brand</th>
                <th>What they need</th>
                <th>Emails</th>
                <th>Their reply</th>
                <th>Stage</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((seq) => {
                const brand = seq.contact.brand;
                const awaiting = !!seq.awaitingResponseSince;
                const systemSends = seq.messages.filter((m) => m.source === "SYSTEM");
                const manualSends = seq.messages.length - systemSends.length;
                const mirrored = seq.inboxThreads[0]?.messages[0] ?? null;
                const replyText = seq.lastReplyText ?? mirrored?.snippet ?? null;
                const replyAt = seq.lastReplyAt ?? mirrored?.sentAt ?? null;
                const hasReplied = !!replyAt || seq.status === "REPLIED" || seq.status === "UNSUBSCRIBED";
                const pending = seq.scheduledActions[0];
                const name = brand?.name ?? seq.contact.name;
                const inboxThreadId = seq.inboxThreads[0]?.id ?? null;
                const replyScheduledFor = scheduledReplies.get(seq.id) ?? null;
                const sheet = sheetFor(seq.contact.email, brand?.name);

                return (
                  <tr key={seq.id} style={awaiting ? { background: "var(--brands-accent-light)", boxShadow: "inset 3px 0 0 var(--brands-accent)" } : undefined}>
                    <td>
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Avatar name={name} size={32} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/dashboard/${seq.id}`} className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)] truncate">
                              {name}
                            </Link>
                            {brand?.isAgency && (
                              <span className="badge" style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}>
                                Agency
                              </span>
                            )}
                            <StarToggle sequenceId={seq.id} initialImportant={seq.isImportant} />
                          </div>
                          <div className="text-xs text-[var(--muted-2)] truncate">
                            {seq.contact.name !== name ? `${seq.contact.name} · ` : ""}
                            {seq.contact.email}
                          </div>
                          {brand?.category && <div className="text-xs text-[var(--muted-2)] truncate">{brand.category}</div>}
                        </div>
                      </div>
                    </td>

                    <td className="text-xs text-[var(--muted)]">
                      <div className="truncate">
                        <span className="text-[var(--muted-2)]">Budget </span>
                        <span className="text-[var(--ink)]">{budgetLabel(brand?.budgetRangeText ?? null, brand?.budgetType ?? "UNKNOWN")}</span>
                      </div>
                      <div className="mt-0.5 truncate">
                        <span className="text-[var(--muted-2)]">Channel size </span>
                        <span className="text-[var(--ink)]">{influencerRangeLabel(brand?.influencerRangeMin ?? null, brand?.influencerRangeMax ?? null)}</span>
                      </div>
                    </td>

                    <td>
                      <SendDots sent={systemSends} labels={STEP_LABELS} />
                      <div className="text-xs text-[var(--muted-2)] mt-1.5 whitespace-nowrap">
                        {systemSends.length <= 1 ? "Email 1 only" : `Email 1 + ${Math.min(systemSends.length - 1, 3)} follow-up${systemSends.length > 2 ? "s" : ""}`}
                      </div>
                      {manualSends > 0 && <div className="text-xs text-[var(--muted-2)] whitespace-nowrap">You wrote {manualSends}×</div>}
                    </td>

                    <td>
                      {hasReplied ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {awaiting && (
                              <span className="badge" style={{ background: "var(--brands-accent)", color: "#fff" }}>
                                <MessageSquareReply size={11} /> Needs your reply
                              </span>
                            )}
                            <span className="text-xs font-medium text-[var(--ink)]">{brandReplyLabel(seq.replyIntent)}</span>
                            {replyAt && <span className="text-xs text-[var(--muted-2)]">{formatDateTime(replyAt)}</span>}
                          </div>
                          {replyText && <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2 break-words">{replyText}</p>}
                          {replyScheduledFor && (
                            <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--info-fg)" }}>
                              Your reply is scheduled for {formatDateTime(replyScheduledFor)}
                            </p>
                          )}
                          {(inboxThreadId || awaiting) && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {inboxThreadId && <ReplyPanel threadId={inboxThreadId} name={name} workspace="brands" stage={seq.stage} rosterUrl={rosterUrl} />}
                              {awaiting && <MarkHandledButton sequenceId={seq.id} compact />}
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
                      <StageBadge stage={seq.stage} />
                      {seq.rosterSentAt && (
                        <div className="mt-1.5">
                          <span className="badge" style={{ background: "var(--brand-lime-light)", color: "var(--ink)" }} title={`Roster shared ${formatDateTime(seq.rosterSentAt)}`}>
                            <Sparkles size={11} /> Roster sent · {seq.rosterSentAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" })}
                          </span>
                        </div>
                      )}
                      {sheet && (
                        <div className="mt-1.5">
                          <Link
                            href="/brands/pitch-sheets"
                            className="badge"
                            style={sheet.viewCount > 0 ? { background: "var(--success-bg)", color: "var(--success-fg)" } : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}
                            title={sheet.lastViewedAt ? `Pitch sheet last opened ${formatDateTime(sheet.lastViewedAt)}` : "Pitch sheet made — the brand hasn't opened it yet"}
                          >
                            <Link2 size={11} /> Pitch sheet · {sheet.viewCount > 0 ? `opened ${sheet.viewCount}×` : "not opened"}
                          </Link>
                        </div>
                      )}
                    </td>

                    <td className="text-xs text-[var(--muted)]">
                      {pending ? (
                        <>
                          <div className="text-[var(--ink)]">{pending.kind === "TEMPLATE" ? `Follow-up #${pending.step}` : `Nudge #${pending.step}`}</div>
                          <div>{formatDateTime(pending.scheduledAt)}</div>
                        </>
                      ) : seq.status === "PAUSED" ? (
                        "Paused"
                      ) : hasReplied ? (
                        "Follow-ups stopped"
                      ) : (
                        "—"
                      )}
                      <a
                        href={gmailThreadLink(seq.threadId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 font-medium"
                        style={{ color: "var(--brand-teal-dark)" }}
                      >
                        Open in Gmail <ExternalLink size={11} />
                      </a>
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
