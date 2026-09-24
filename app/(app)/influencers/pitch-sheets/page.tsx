import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { daysLeft, linkState } from "@/lib/pitchSheet";
import { appBaseUrl } from "@/lib/pitchSheetServer";
import InfluencerTabs from "../InfluencerTabs";
import PitchSheetActions from "./PitchSheetActions";

// View counts change whenever a brand opens a link.
export const dynamic = "force-dynamic";

function when(d: Date | null): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

export default async function PitchSheetsPage() {
  const h = await headers();
  const base = appBaseUrl(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`);
  const sheets = await prisma.pitchSheet.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { items: { orderBy: { position: "asc" }, select: { creator: { select: { name: true, channelName: true } } } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Influencer Outreach</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">Every creator shortlist you&apos;ve sent a brand — who opened it, and when the link stops working.</p>
      </div>

      <InfluencerTabs active="pitch-sheets" />

      {sheets.length === 0 ? (
        <div className="card px-5 py-14 text-center text-sm text-[var(--muted-2)]">
          No pitch sheets yet. On the{" "}
          <Link href="/influencers/creators?status=ready" className="font-medium" style={{ color: "var(--brand-teal-dark)" }}>
            Creators
          </Link>{" "}
          tab, tick the creators for a brand and choose “Make pitch sheet link”.
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="text-[var(--muted)] text-left">
              <tr className="border-b border-[var(--border)]">
                {["Brand", "Creators", "Link", "Opened", ""].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium text-xs uppercase tracking-wide">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheets.map((s) => {
                const state = linkState(s);
                const left = daysLeft(s.expiresAt);
                const names = s.items.map((i) => i.creator.channelName ?? i.creator.name);
                return (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--ink)]">{s.brandName}</div>
                      <div className="text-xs text-[var(--muted-2)]">
                        {s.brandEmail ?? "No email saved"} · made {when(s.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[280px]">
                      <div className="font-medium text-[var(--ink)]">{names.length}</div>
                      <div className="text-[var(--muted-2)] truncate" title={names.join(", ")}>
                        {names.join(", ")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 font-medium"
                        style={
                          state === "live"
                            ? { background: "var(--success-bg)", color: "var(--success-fg)" }
                            : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
                        }
                      >
                        {state === "live" ? (left === null ? "Live · never expires" : `Live · ${left} day${left === 1 ? "" : "s"} left`) : state === "expired" ? `Expired ${when(s.expiresAt)}` : "Turned off"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className="text-[var(--ink)]">
                        {s.viewCount} time{s.viewCount === 1 ? "" : "s"}
                      </div>
                      <div className="text-[var(--muted-2)]">{s.lastViewedAt ? `last ${when(s.lastViewedAt)}` : "Not opened yet"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <PitchSheetActions
                        id={s.id}
                        url={`${base}/pitch-sheet/${s.token}`}
                        state={state}
                        brandName={s.brandName}
                        brandEmail={s.brandEmail}
                        creatorNames={names}
                        expiresAt={s.expiresAt?.toISOString() ?? null}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
