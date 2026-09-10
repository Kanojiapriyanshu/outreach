import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";
import { companyOrCreatorName } from "@/lib/display";
import TrashRowActions from "./TrashRowActions";

// No searchParams/cookies/headers here for Next to auto-detect this needs a fresh render per
// request — see the note on the same issue fixed for /activity and /analytics.
export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const sequences = await prisma.outreachSequence.findMany({
    where: { deletedAt: { not: null } },
    include: { contact: { include: { brand: true, creator: true } } },
    orderBy: { deletedAt: "desc" },
  });

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Trash</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Deleted threads land here first — follow-ups stay paused the whole time. Restore one, or delete it for good.
          Nothing here is ever removed from Gmail itself.
        </p>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Contact</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Type</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Company/Creator</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Deleted</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide"></th>
            </tr>
          </thead>
          <tbody>
            {sequences.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-14 text-center text-[var(--muted-2)] text-sm">
                  Trash is empty.
                </td>
              </tr>
            )}
            {sequences.map((seq) => (
              <tr key={seq.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-medium text-[var(--ink)]">{seq.contact.name}</div>
                  <div className="text-[var(--muted-2)] text-xs">{seq.contact.email}</div>
                </td>
                <td className="px-5 py-3.5 text-[var(--muted)]">{seq.outreachType === "BRAND" ? "Brand" : "Creator"}</td>
                <td className="px-5 py-3.5 text-[var(--muted)]">{companyOrCreatorName(seq.contact)}</td>
                <td className="px-5 py-3.5 text-[var(--muted-2)] whitespace-nowrap">
                  {seq.deletedAt ? formatDateTime(seq.deletedAt) : "—"}
                </td>
                <td className="px-5 py-3.5">
                  <TrashRowActions sequenceId={seq.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
