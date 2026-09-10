import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";
import DraftRow from "./DraftRow";

// No searchParams/cookies/headers here for Next to auto-detect fresh-per-request — see the same
// note on /activity, /analytics, /scheduled.
export const dynamic = "force-dynamic";

interface DraftPayload {
  contactEmail?: string;
  brandDetails?: { contactName?: string; brandName?: string; campaignName?: string };
  creatorName?: string;
}

export default async function DraftsPage() {
  const drafts = await prisma.draft.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Drafts</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Emails you started but haven&rsquo;t sent yet — pick one up where you left off, or delete it.
        </p>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">To</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Type</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Company/Creator</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Last Edited</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide"></th>
            </tr>
          </thead>
          <tbody>
            {drafts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-14 text-center text-[var(--muted-2)] text-sm">
                  No drafts — &quot;Save as Draft&quot; on the New Outreach page keeps one here for later.
                </td>
              </tr>
            )}
            {drafts.map((d) => {
              const payload = d.payload as unknown as DraftPayload;
              const companyOrCreator =
                d.outreachType === "BRAND"
                  ? payload.brandDetails?.campaignName || payload.brandDetails?.brandName || "—"
                  : payload.creatorName || "—";
              return (
                <tr key={d.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-[var(--ink)]">{d.contactName || "(no recipient name yet)"}</div>
                    <div className="text-[var(--muted-2)] text-xs">{d.contactEmail || payload.contactEmail || "—"}</div>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--muted)]">{d.outreachType === "BRAND" ? "Brand" : "Creator"}</td>
                  <td className="px-5 py-3.5 text-[var(--muted)]">{companyOrCreator}</td>
                  <td className="px-5 py-3.5 text-[var(--muted-2)] whitespace-nowrap">{formatDateTime(d.updatedAt)}</td>
                  <td className="px-5 py-3.5">
                    <DraftRow draftId={d.id} outreachType={d.outreachType} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
