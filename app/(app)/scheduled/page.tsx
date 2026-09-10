import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";
import CancelScheduledEmail from "./CancelScheduledEmail";

// No searchParams/cookies/headers usage here for Next to auto-detect this needs a fresh render
// per request — without this, it gets prerendered once at build time and would keep showing
// whatever was scheduled (or not) at build time instead of what's actually pending right now.
export const dynamic = "force-dynamic";

interface ComposePayload {
  outreachType: "BRAND" | "CREATOR";
  recipientType?: "DIRECT" | "AGENCY";
  contactEmail: string;
  contactName: string;
  brand?: { name: string; campaignName?: string };
  creator?: { name: string };
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
          folder. You can cancel anything that hasn&rsquo;t gone out yet.
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
              const payload = s.payload as unknown as ComposePayload;
              const companyOrCreator = payload.brand?.campaignName || payload.brand?.name || payload.creator?.name || "—";
              return (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-[var(--ink)]">{payload.contactName || "—"}</div>
                    <div className="text-[var(--muted-2)] text-xs">{payload.contactEmail}</div>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted)]">
                    {payload.outreachType === "BRAND" ? (payload.recipientType === "AGENCY" ? "Agency" : "Brand") : "Creator"}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted)]">{companyOrCreator}</td>
                  <td className="px-5 py-3.5 text-[var(--ink)] whitespace-nowrap">{formatDateTime(s.scheduledAt)}</td>
                  <td className="px-5 py-3.5">
                    <CancelScheduledEmail scheduledEmailId={s.id} />
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
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[var(--muted-2)] text-sm">
                  No scheduled sends have gone out, failed, or been cancelled yet.
                </td>
              </tr>
            )}
            {history.map((s) => {
              const payload = s.payload as unknown as ComposePayload;
              const style = STATUS_STYLE[s.status] ?? STATUS_STYLE.PENDING;
              return (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-[var(--ink)]">{payload.contactName || "—"}</div>
                    <div className="text-[var(--muted-2)] text-xs">{payload.contactEmail}</div>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted)] whitespace-nowrap">{formatDateTime(s.scheduledAt)}</td>
                  <td className="px-5 py-3.5">
                    <span className="badge" style={{ background: style.bg, color: style.fg }}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted-2)] text-xs">
                    {s.status === "SENT" && s.sentSequenceId ? (
                      <Link href={`/dashboard/${s.sentSequenceId}`} className="hover:text-[var(--brand-teal-dark)]">
                        View sequence →
                      </Link>
                    ) : s.status === "FAILED" && s.error ? (
                      s.error
                    ) : (
                      "—"
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
