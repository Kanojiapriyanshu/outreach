import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";

// No searchParams/cookies/headers here for Next to auto-detect this needs a fresh render per
// request — without this it gets prerendered once at build time and keeps showing whatever the
// activity log looked like then, never picking up anything logged after that deploy.
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const logs = await prisma.activityLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 200,
    include: { sequence: { include: { contact: { include: { brand: true, creator: true } } } } },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">History</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">Everything the system has done, most recent first.</p>
      </div>
      <div className="card divide-y divide-[var(--border)]">
        {logs.length === 0 && <p className="p-5 text-[var(--muted-2)] text-sm">No activity yet.</p>}
        {logs.map((log) => (
          <div key={log.id} className="p-4 text-sm flex justify-between gap-4">
            <div>
              <div className="text-[var(--ink)]">{log.description}</div>
              {log.sequence && (
                <Link href={`/dashboard/${log.sequence.id}`} className="text-xs text-[var(--muted-2)] hover:underline">
                  {log.sequence.contact.brand?.name ?? log.sequence.contact.creator?.name ?? log.sequence.contact.name}
                </Link>
              )}
            </div>
            <div className="text-[var(--muted-2)] text-xs whitespace-nowrap">{formatDateTime(log.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
