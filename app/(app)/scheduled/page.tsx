import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";
import ScheduledEmailActions from "./ScheduledEmailActions";

// No searchParams/cookies/headers usage here for Next to auto-detect this needs a fresh render
// per request — without this, it gets prerendered once at build time and would keep showing
// whatever was scheduled (or not) at build time instead of what's actually pending right now.
export const dynamic = "force-dynamic";

interface SequencePayload {
  outreachType: "BRAND" | "CREATOR";
  recipientType?: "DIRECT" | "AGENCY";
  contactEmail: string;
  contactName: string;
  brand?: { name: string; campaignName?: string };
  creator?: { name: string };
}

interface PlainPayload {
  to: string;
  subject: string;
}

/** Normalizes either payload shape (see ScheduledInitialEmailKind) into what the table below
 * actually renders, so the JSX doesn't need to branch on `kind` in five different places. */
function describeRow(kind: "SEQUENCE" | "PLAIN", payload: unknown) {
  if (kind === "PLAIN") {
    const p = payload as PlainPayload;
    return { name: p.subject || "(no subject)", email: p.to, typeLabel: "General email", companyOrCreator: "—" };
  }
  const p = payload as SequencePayload;
  return {
    name: p.contactName || "—",
    email: p.contactEmail,
    typeLabel: p.outreachType === "BRAND" ? (p.recipientType === "AGENCY" ? "Agency" : "Brand") : "Creator",
    companyOrCreator: p.brand?.campaignName || p.brand?.name || p.creator?.name || "—",
  };
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "var(--info-bg)", fg: "var(--info-fg)" },
  SENT: { bg: "var(--success-bg)", fg: "var(--success-fg)" },
  FAILED: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
  CANCELLED: { bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Scheduled",
  SENT: "Sent",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

/** How close the actual send landed to the time it was scheduled for. Worth showing rather than
 * assuming: the worker used to run on a plain cron schedule that could drift by over an hour, so
 * "did it actually go out when I said" is a question the page should answer on its own. */
function DeliveryAccuracy({ scheduledAt, sentAt }: { scheduledAt: Date; sentAt: Date }) {
  const driftMs = sentAt.getTime() - scheduledAt.getTime();
  const driftMin = Math.round(driftMs / 60000);

  if (driftMin <= 2) {
    return <div style={{ color: "var(--success-fg)" }}>On time</div>;
  }
  const label = driftMin < 60 ? `${driftMin} min late` : `${Math.floor(driftMin / 60)}h ${driftMin % 60}m late`;
  return <div style={{ color: driftMin > 15 ? "var(--danger-fg)" : "var(--muted-2)" }}>{label}</div>;
}

export default async function ScheduledPage() {
  const [pending, history] = await Promise.all([
    prisma.scheduledInitialEmail.findMany({
      where: { status: "PENDING" },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.scheduledInitialEmail.findMany({
      where: { status: { in: ["SENT", "FAILED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Scheduled Emails</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Every first email you&rsquo;ve told the CRM to send later, in one place — like Gmail&rsquo;s own Scheduled
          folder. Reschedule or cancel anything that hasn&rsquo;t gone out yet; a cancelled one can still be
          rescheduled or deleted for good from History below.
        </p>
      </div>

      <section className="card overflow-hidden overflow-x-auto">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm text-[var(--ink)]">
            Upcoming <span className="text-[var(--muted-2)] font-normal">({pending.length})</span>
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Recipient</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Type</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Company/Creator</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Scheduled For</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide"></th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[var(--muted-2)] text-sm">
                  Nothing scheduled right now — use &quot;Write &amp; Send&quot; → &quot;Schedule for later&quot; on the
                  New Outreach page.
                </td>
              </tr>
            )}
            {pending.map((s) => {
              const row = describeRow(s.kind, s.payload);
              return (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-[var(--ink)]">{row.name}</div>
                    <div className="text-[var(--muted-2)] text-xs">{row.email}</div>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted)]">{row.typeLabel}</td>
                  <td className="px-5 py-3.5 text-[var(--muted)]">{row.companyOrCreator}</td>
                  <td className="px-5 py-3.5 text-[var(--ink)] whitespace-nowrap">{formatDateTime(s.scheduledAt)}</td>
                  <td className="px-5 py-3.5">
                    <ScheduledEmailActions
                      scheduledEmailId={s.id}
                      status={s.status as "PENDING" | "SENT" | "FAILED" | "CANCELLED"}
                      scheduledAt={s.scheduledAt.toISOString()}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card overflow-hidden overflow-x-auto">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm text-[var(--ink)]">History</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Recipient</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Was Scheduled For</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Detail</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide"></th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[var(--muted-2)] text-sm">
                  No scheduled sends have gone out, failed, or been cancelled yet.
                </td>
              </tr>
            )}
            {history.map((s) => {
              const row = describeRow(s.kind, s.payload);
              const style = STATUS_STYLE[s.status] ?? STATUS_STYLE.PENDING;
              return (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-[var(--ink)]">{row.name}</div>
                    <div className="text-[var(--muted-2)] text-xs">{row.email}</div>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted)] whitespace-nowrap">{formatDateTime(s.scheduledAt)}</td>
                  <td className="px-5 py-3.5">
                    <span className="badge" style={{ background: style.bg, color: style.fg }}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted-2)] text-xs">
                    {s.status === "SENT" && s.sentSequenceId ? (
                      <div className="space-y-0.5">
                        <Link href={`/dashboard/${s.sentSequenceId}`} className="hover:text-[var(--brand-teal-dark)]">
                          View sequence →
                        </Link>
                        {s.sentAt && <DeliveryAccuracy scheduledAt={s.scheduledAt} sentAt={s.sentAt} />}
                      </div>
                    ) : s.status === "FAILED" && s.error ? (
                      s.error
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {s.status !== "SENT" && (
                      <ScheduledEmailActions
                        scheduledEmailId={s.id}
                        status={s.status as "PENDING" | "SENT" | "FAILED" | "CANCELLED"}
                        scheduledAt={s.scheduledAt.toISOString()}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
