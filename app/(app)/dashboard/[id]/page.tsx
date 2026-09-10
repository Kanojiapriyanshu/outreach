import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { companyOrCreatorName } from "@/lib/display";
import { formatDateTime } from "@/lib/formatDate";
import Badge, { StageBadge } from "@/app/components/Badge";
import SequenceControls from "./SequenceControls";
import StageControl from "./StageControl";
import UpcomingFollowUpPreview from "./UpcomingFollowUpPreview";
import CreatorListResponseControl from "./CreatorListResponseControl";
import TrashBanner from "./TrashBanner";

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
  const creatorListSent = !PRE_LIST_STAGES.includes(sequence.stage);
  const pendingNudge = pending?.kind === "CREATOR_LIST_NUDGE" ? pending : undefined;

  const timeline = [
    ...sequence.messages.map((m) => ({
      time: m.sentAt,
      label: m.direction === "OUT" ? `Sent: ${m.subject}` : `Received reply`,
    })),
    ...sequence.activityLogs.map((a) => ({ time: a.timestamp, label: a.description })),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)] break-words">
            {companyOrCreatorName(sequence.contact)}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5 break-words">
            {sequence.contact.name} · {sequence.contact.email} · {sequence.outreachType === "BRAND" ? "Brand" : "Creator"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <StageBadge stage={sequence.stage} />
          <Badge status={sequence.status} />
        </div>
      </div>

      {sequence.deletedAt && <TrashBanner sequenceId={sequence.id} deletedAt={sequence.deletedAt.toISOString()} />}

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
                  Follow-up #{displayedAction.step} was cancelled — it was going to send on{" "}
                  {formatDateTime(displayedAction.scheduledAt)}.
                </>
              ) : (
                <>
                  Next up: follow-up #{displayedAction.step} on {formatDateTime(displayedAction.scheduledAt)}
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
          <StageControl sequenceId={sequence.id} stage={sequence.stage} />
          <p className="text-xs text-[var(--muted-2)] mt-1.5">
            First Email Sent, Creator List Sent, and Not Interested are set automatically from the inbox — Negotiation,
            Creator Selected, and Deal are calls only you can make.
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
        <h2 className="font-semibold text-sm mb-4 text-[var(--ink)]">Timeline</h2>
        <ol className="space-y-3.5">
          {timeline.map((event, i) => (
            <li key={i} className="text-sm border-l-2 border-[var(--border)] pl-3.5">
              <div className="text-[var(--muted-2)] text-xs">{formatDateTime(event.time)}</div>
              <div className="text-[var(--ink)] mt-0.5">{event.label}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-sm mb-4 text-[var(--ink)]">Messages</h2>
        <div className="space-y-4">
          {sequence.messages.map((m) => (
            <div key={m.id} className="border border-[var(--border)] rounded-xl p-4">
              <div className="flex justify-between text-xs text-[var(--muted-2)] mb-1.5">
                <span>{m.direction === "OUT" ? "Sent" : "Received"}</span>
                <span>{formatDateTime(m.sentAt)}</span>
              </div>
              <div className="font-medium text-sm mb-1.5 text-[var(--ink)]">{m.subject}</div>
              <pre className="whitespace-pre-wrap text-sm text-[var(--muted)] font-sans">{m.body}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
