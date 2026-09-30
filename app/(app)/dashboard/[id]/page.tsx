import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, MessageSquareReply } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { budgetLabel, companyOrCreatorName, gmailThreadLink, influencerRangeLabel } from "@/lib/display";
import { formatAgo, formatDateTime } from "@/lib/formatDate";
import { brandReplyLabel } from "@/lib/brandOutreach";
import Badge, { StageBadge } from "@/app/components/Badge";
import MarkHandledButton from "@/app/components/MarkHandledButton";
import SequenceControls from "./SequenceControls";
import StageControl from "./StageControl";
import UpcomingFollowUpPreview from "./UpcomingFollowUpPreview";
import CreatorListResponseControl from "./CreatorListResponseControl";
import CreatorResponsePanel from "./CreatorResponsePanel";
import TrashBanner from "./TrashBanner";
import { parseStoredRates } from "@/lib/creatorReplyAnalysis";

// A brand only enters this part of the pipeline once the creator shortlist has actually gone
// out — mirrors PRE_LIST_STAGES in lib/scheduler.ts.
const PRE_LIST_STAGES = ["FIRST_EMAIL_SENT", "CREATOR_LIST_REQUESTED"];

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sequence = await prisma.outreachSequence.findUnique({
    where: { id },
    include: {
      contact: { include: { brand: true, creator: true } },
      emailAccount: true,
      scheduledActions: { orderBy: { step: "asc" } },
      messages: { orderBy: { sentAt: "asc" } },
      activityLogs: { orderBy: { timestamp: "asc" } },
      // A brand reply recorded before reply text was stored still shows — read from the inbox mirror.
      inboxThreads: {
        take: 1,
        select: { messages: { where: { direction: "IN" }, orderBy: { sentAt: "desc" }, take: 1, select: { snippet: true, bodyText: true } } },
      },
    },
  });

  if (!sequence) notFound();

  const pending = sequence.scheduledActions.find((a) => a.status === "PENDING");
  // A cancelled follow-up doesn't get replaced by anything automatically (unlike "Skip", which
  // schedules the next step) — so once one is cancelled, it needs to stay visible/reachable for
  // reschedule-or-delete, same as a cancelled scheduled Email 1 does on /scheduled.
  const mostRecentCancelled = !pending
    ? [...sequence.scheduledActions].filter((a) => a.status === "CANCELLED").sort((a, b) => b.step - a.step)[0]
    : undefined;
  const displayedAction = pending ?? mostRecentCancelled;
  const isCreator = sequence.outreachType === "CREATOR";
  // Influencer threads have no creator list — their Interested/Rate Received stages aren't "past
  // the list", so that card only ever applies to brands.
  const creatorListSent = !isCreator && !PRE_LIST_STAGES.includes(sequence.stage);
  const pendingNudge = pending?.kind === "CREATOR_LIST_NUDGE" ? pending : undefined;

  const timeline = [
    ...sequence.messages.map((m) => ({
      time: m.sentAt,
      label: m.direction === "OUT" ? `Sent: ${m.subject}` : `Received reply`,
    })),
    ...sequence.activityLogs.map((a) => ({ time: a.timestamp, label: a.description })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  const brand = sequence.contact.brand;
  const creator = sequence.contact.creator;
  const accent = isCreator ? "var(--influencers-accent)" : "var(--brands-accent)";
  const accentLight = isCreator ? "var(--influencers-accent-light)" : "var(--brands-accent-light)";
  const mirroredReply = sequence.inboxThreads[0]?.messages[0];
  const brandReplyText = sequence.lastReplyText ?? mirroredReply?.bodyText?.trim() ?? mirroredReply?.snippet ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={isCreator ? "/influencers" : "/brands"}
          className="inline-flex items-center gap-1 text-xs font-medium mb-3 rounded-md px-1.5 py-0.5"
          style={{ color: accent, background: accentLight }}
        >
          <ChevronLeft size={13} /> {isCreator ? "Influencer outreach" : "Brand outreach"}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] leading-8 font-semibold tracking-tight text-[var(--ink)] break-words">
              {companyOrCreatorName(sequence.contact) === "—" ? sequence.contact.name : companyOrCreatorName(sequence.contact)}
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1 break-words">
              {sequence.contact.name} · {sequence.contact.email}
              {!isCreator && brand?.isAgency ? " · Agency" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <StageBadge stage={sequence.stage} />
            <Badge status={sequence.status} />
            <a href={gmailThreadLink(sequence.threadId)} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
              Open in Gmail <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {sequence.deletedAt && <TrashBanner sequenceId={sequence.id} deletedAt={sequence.deletedAt.toISOString()} />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
      <div className="space-y-5 min-w-0">
      {!isCreator && sequence.lastReplyAt && (
        <div
          className="card p-5"
          style={sequence.awaitingResponseSince ? { borderColor: "var(--brands-accent)", boxShadow: "0 0 0 1px var(--brands-accent-light)" } : undefined}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-sm text-[var(--ink)] flex items-center gap-2">
                <MessageSquareReply size={15} style={{ color: "var(--brands-accent)" }} /> Their latest reply
              </h2>
              <p className="text-xs text-[var(--muted)] mt-1">
                {brandReplyLabel(sequence.replyIntent)} · {formatDateTime(sequence.lastReplyAt)} ({formatAgo(sequence.lastReplyAt)})
                {sequence.repliedAfterStep !== null && ` · first replied after ${sequence.repliedAfterStep === 0 ? "Email 1" : `follow-up ${sequence.repliedAfterStep}`}`}
              </p>
            </div>
            {sequence.awaitingResponseSince && <MarkHandledButton sequenceId={sequence.id} compact />}
          </div>
          {brandReplyText && (
            <blockquote className="mt-3 text-sm text-[var(--ink)] whitespace-pre-wrap break-words rounded-lg px-4 py-3 max-h-64 overflow-y-auto" style={{ background: "var(--surface-2)", borderLeft: "3px solid var(--brands-accent)" }}>
              {brandReplyText}
            </blockquote>
          )}
        </div>
      )}

      {isCreator && (
        <CreatorResponsePanel
          sequenceId={sequence.id}
          status={sequence.status}
          lastReplyAt={sequence.lastReplyAt?.toISOString() ?? null}
          replyIntent={sequence.replyIntent}
          replySummary={sequence.replySummary}
          lastReplyText={sequence.lastReplyText}
          repliedAfterStep={sequence.repliedAfterStep}
          awaitingSince={sequence.awaitingResponseSince?.toISOString() ?? null}
          rates={parseStoredRates(sequence.quotedRates)}
          rateNote={sequence.rateNote}
          followUpScheduled={!!pending}
        />
      )}

      <div className="card p-5">
        <h2 className="font-semibold text-sm mb-3.5 text-[var(--ink)]">Actions</h2>
        <SequenceControls
          sequenceId={sequence.id}
          status={sequence.status}
          hasPending={!!pending}
          isImportant={sequence.isImportant}
        />
        {displayedAction && (
          <>
            <p className="text-sm text-[var(--muted)] mt-3">
              {displayedAction.status === "CANCELLED" ? (
                <>
                  {displayedAction.kind === "CREATOR_NUDGE" ? "Check-in" : "Follow-up"} #{displayedAction.step} was cancelled — it
                  was going to send on {formatDateTime(displayedAction.scheduledAt)}.
                </>
              ) : (
                <>
                  Next up: {displayedAction.kind === "CREATOR_NUDGE" ? "check-in" : "follow-up"} #{displayedAction.step} on{" "}
                  {formatDateTime(displayedAction.scheduledAt)}
                </>
              )}
            </p>
            <UpcomingFollowUpPreview
              scheduledActionId={displayedAction.id}
              status={displayedAction.status as "PENDING" | "CANCELLED"}
            />
          </>
        )}
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <StageControl sequenceId={sequence.id} stage={sequence.stage} outreachType={sequence.outreachType} />
          <p className="text-xs text-[var(--muted-2)] mt-1.5">
            {isCreator
              ? "Interested, Rate Received, and Not Interested are set automatically from their replies — correct them here, or move a creator on to Negotiation or Deal."
              : "First Email Sent, Creator List Sent, and Not Interested are set automatically from the inbox — Negotiation, Creator Selected, and Deal are calls only you can make."}
          </p>
        </div>
      </div>

      {creatorListSent && (
        <div className="card p-5">
          <h2 className="font-semibold text-sm mb-1 text-[var(--ink)]">Creator List Follow-Ups</h2>
          <p className="text-xs text-[var(--muted-2)] mb-3.5">
            Tracks replies to the creator shortlist separately from the initial outreach above — up to 3 nudges plus a
            final close-out, on the same business-day cadence and sending window.
          </p>
          <CreatorListResponseControl
            sequenceId={sequence.id}
            respondedAt={sequence.creatorListResponseAt ? sequence.creatorListResponseAt.toISOString() : null}
          />
          {pendingNudge && (
            <p className="text-sm text-[var(--muted)] mt-3">
              Next nudge: #{pendingNudge.step} of 4 on {formatDateTime(pendingNudge.scheduledAt)}
            </p>
          )}
          {!pendingNudge && sequence.status === "FOLLOW_UP_4_SENT" && (
            <p className="text-sm text-[var(--muted)] mt-3">
              Final close-out sent — no more nudges scheduled unless a new creator list goes out.
            </p>
          )}
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold text-sm mb-4 text-[var(--ink)]">Emails sent</h2>
        <div className="space-y-4">
          {sequence.messages.map((m) => (
            <div key={m.id} className="border border-[var(--border)] rounded-xl p-4">
              <div className="flex justify-between text-xs text-[var(--muted-2)] mb-1.5">
                <span>{m.direction === "OUT" ? (m.source === "MANUAL" ? "You wrote in Gmail" : "Sent by the system") : "Received"}</span>
                <span>{formatDateTime(m.sentAt)}</span>
              </div>
              <div className="font-medium text-sm mb-1.5 text-[var(--ink)]">{m.subject}</div>
              <pre className="whitespace-pre-wrap text-sm text-[var(--muted)] font-sans">{m.body}</pre>
            </div>
          ))}
        </div>
      </div>
      </div>

      <aside className="space-y-5">
        <div className="card p-5">
          <h2 className="font-semibold text-sm mb-3 text-[var(--ink)]">Details</h2>
          <dl className="space-y-2.5 text-sm">
            <Detail label="Workspace">
              <span className="badge" style={{ background: accentLight, color: accent }}>
                {isCreator ? "Influencer" : brand?.isAgency ? "Brand · via agency" : "Brand"}
              </span>
            </Detail>
            <Detail label="Contact">{sequence.contact.name}</Detail>
            <Detail label="Email">
              <span className="break-all">{sequence.contact.email}</span>
            </Detail>
            {!isCreator && brand?.category && <Detail label="Sells">{brand.category}</Detail>}
            {!isCreator && <Detail label="Budget">{budgetLabel(brand?.budgetRangeText ?? null, brand?.budgetType ?? "UNKNOWN")}</Detail>}
            {!isCreator && <Detail label="Channel size">{influencerRangeLabel(brand?.influencerRangeMin ?? null, brand?.influencerRangeMax ?? null)}</Detail>}
            {!isCreator && brand?.website && (
              <Detail label="Website">
                <a href={brand.website.startsWith("http") ? brand.website : `https://${brand.website}`} target="_blank" rel="noopener noreferrer" className="hover:underline break-all" style={{ color: "var(--brand-teal-dark)" }}>
                  {brand.website.replace(/^https?:\/\//, "")}
                </a>
              </Detail>
            )}
            {isCreator && creator?.channelUrl && (
              <Detail label="Channel">
                <a href={creator.channelUrl} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1" style={{ color: "var(--brand-teal-dark)" }}>
                  {creator.channelName ?? creator.name} <ExternalLink size={11} />
                </a>
              </Detail>
            )}
            {isCreator && creator?.subscriberCount != null && <Detail label="Subscribers">{creator.subscriberCount.toLocaleString("en-US")}</Detail>}
            <Detail label="Sent from">
              <span className="break-all">{sequence.emailAccount.email}</span>
            </Detail>
            <Detail label="Started">{formatDateTime(sequence.createdAt)}</Detail>
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-sm mb-4 text-[var(--ink)]">Timeline</h2>
          <ol className="space-y-3.5 max-h-[560px] overflow-y-auto scroll-slim pr-1">
            {[...timeline].reverse().map((event, i) => (
              <li key={i} className="text-sm border-l-2 border-[var(--border)] pl-3.5">
                <div className="text-[var(--muted-2)] text-xs">{formatDateTime(event.time)}</div>
                <div className="text-[var(--ink)] mt-0.5">{event.label}</div>
              </li>
            ))}
          </ol>
        </div>
      </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <dt className="text-[var(--muted-2)] text-xs pt-0.5">{label}</dt>
      <dd className="text-[var(--ink)] min-w-0">{children}</dd>
    </div>
  );
}
