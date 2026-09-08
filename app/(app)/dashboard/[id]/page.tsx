import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { companyOrCreatorName } from "@/lib/display";
import Badge, { StageBadge } from "@/app/components/Badge";
import SequenceControls from "./SequenceControls";
import StageControl from "./StageControl";
import UpcomingFollowUpPreview from "./UpcomingFollowUpPreview";

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

      <div className="card p-5">
        <h2 className="font-semibold text-sm mb-3.5 text-[var(--ink)]">Actions</h2>
        <SequenceControls sequenceId={sequence.id} status={sequence.status} hasPending={!!pending} />
        {pending && (
          <>
            <p className="text-sm text-[var(--muted)] mt-3">
              Next up: follow-up #{pending.step} on {pending.scheduledAt.toLocaleString()}
            </p>
            <UpcomingFollowUpPreview scheduledActionId={pending.id} />
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

      <div className="card p-5">
        <h2 className="font-semibold text-sm mb-4 text-[var(--ink)]">Timeline</h2>
        <ol className="space-y-3.5">
          {timeline.map((event, i) => (
            <li key={i} className="text-sm border-l-2 border-[var(--border)] pl-3.5">
              <div className="text-[var(--muted-2)] text-xs">{event.time.toLocaleString()}</div>
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
                <span>{m.sentAt.toLocaleString()}</span>
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
