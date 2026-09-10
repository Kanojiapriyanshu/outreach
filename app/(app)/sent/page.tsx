import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/formatDate";
import { companyOrCreatorName } from "@/lib/display";
import SentSearch from "./SentSearch";
import type { Prisma } from "@/app/generated/prisma/client";

// No searchParams/cookies/headers signal strong enough for Next to auto-detect fresh-per-request
// here (searchParams alone doesn't count) — force it so a new send shows up without a redeploy.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);

  const where: Prisma.EmailMessageWhereInput = {
    direction: "OUT",
    sequence: { deletedAt: null },
    ...(q?.trim()
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" as const } },
            { body: { contains: q, mode: "insensitive" as const } },
            { sequence: { contact: { name: { contains: q, mode: "insensitive" as const } } } },
            { sequence: { contact: { email: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [totalCount, messages] = await Promise.all([
    prisma.emailMessage.count({ where }),
    prisma.emailMessage.findMany({
      where,
      include: { sequence: { include: { contact: { include: { brand: true, creator: true } } } } },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const start = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Sent</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Every email this CRM has actually sent — Email 1s, follow-ups, and nudges — across every contact, like
          Gmail&rsquo;s own Sent folder.
        </p>
      </div>

      <SentSearch />

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">To</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Company/Creator</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Subject</th>
              <th className="px-5 py-3 font-medium text-xs uppercase tracking-wide">Sent</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-14 text-center text-[var(--muted-2)] text-sm">
                  {q ? "No sent emails match that search." : "Nothing sent yet."}
                </td>
              </tr>
            )}
            {messages.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors">
                <td className="px-5 py-3.5">
                  <Link
                    href={`/dashboard/${m.sequenceId}`}
                    className="font-medium text-[var(--ink)] hover:text-[var(--brand-teal)]"
                  >
                    {m.sequence.contact.name || m.sequence.contact.email}
                  </Link>
                  <div className="text-[var(--muted-2)] text-xs">{m.sequence.contact.email}</div>
                </td>
                <td className="px-5 py-3.5 text-[var(--muted)]">{companyOrCreatorName(m.sequence.contact)}</td>
                <td className="px-5 py-3.5 text-[var(--ink)] max-w-xs truncate">{m.subject}</td>
                <td className="px-5 py-3.5 text-[var(--muted-2)] whitespace-nowrap">{formatDateTime(m.sentAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
          <span className="text-[var(--muted)]">
            {start}–{end} of {totalCount}
          </span>
          <div className="flex gap-2">
            <Link
              href={`/sent?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) }).toString()}`}
              aria-disabled={page <= 1}
              className={`btn-secondary px-3 py-1.5 text-xs ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              ← Newer
            </Link>
            <Link
              href={`/sent?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) }).toString()}`}
              aria-disabled={end >= totalCount}
              className={`btn-secondary px-3 py-1.5 text-xs ${end >= totalCount ? "pointer-events-none opacity-40" : ""}`}
            >
              Older →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
