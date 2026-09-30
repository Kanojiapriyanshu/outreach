import Link from "next/link";
import { headers } from "next/headers";
import { Link2, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { daysLeft, linkState, pitchSheetUrl } from "@/lib/pitchSheet";
import { appBaseUrl } from "@/lib/pitchSheetServer";
import { EmptyState, Kpi, KpiGrid, PageHeader } from "@/app/components/ui";
import BrandTabs from "../BrandTabs";
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
    include: { items: { orderBy: { position: "asc" }, select: { id: true, creator: { select: { name: true, channelName: true } } } } },
  });

  const live = sheets.filter((s) => linkState(s) === "live");
  const opened = sheets.filter((s) => s.viewCount > 0);
  const unopened = live.filter((s) => s.viewCount === 0);
  const creatorsPitched = new Set(sheets.flatMap((s) => s.items.map((i) => i.creator.channelName ?? i.creator.name))).size;

  return (
    <div className="space-y-6">
      <PageHeader
        workspace="brands"
        section="Pitch sheets"
        title="Pitch sheets"
        description="Every creator shortlist you've sent a brand — who opened it, and when each link stops working."
        actions={
          <Link href="/influencers/creators?status=ready" className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
            <Plus size={16} /> New pitch sheet
          </Link>
        }
      />

      <BrandTabs active="pitch-sheets" />

      <KpiGrid columns={4}>
        <Kpi label="Live links" value={live.length} hint={`${sheets.length} made in total`} />
        <Kpi label="Opened by the brand" value={opened.length} hint={sheets.length ? `${Math.round((opened.length / sheets.length) * 100)}% open rate` : undefined} tone={opened.length > 0 ? "success" : "default"} />
        <Kpi label="Live but not opened yet" value={unopened.length} hint={unopened.length ? "Worth a nudge" : "Every live link has been opened"} />
        <Kpi label="Creators pitched" value={creatorsPitched} hint="Across every sheet" />
      </KpiGrid>

      <div className="card overflow-hidden overflow-x-auto scroll-slim">
        {sheets.length === 0 ? (
          <EmptyState
            icon={<Link2 size={18} />}
            title="No pitch sheets yet"
            body={
              <>
                On{" "}
                <Link href="/influencers/creators?status=ready" className="font-medium" style={{ color: "var(--brand-teal-dark)" }}>
                  Creators
                </Link>
                , tick the creators for a brand and choose “Make pitch sheet link”. The brand gets one short link with each creator&apos;s channel, media kit and your rate.
              </>
            }
          />
        ) : (
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Creators</th>
                <th>Link</th>
                <th>Opened</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((s) => {
                const state = linkState(s);
                const left = daysLeft(s.expiresAt);
                const names = s.items.map((i) => i.creator.channelName ?? i.creator.name);
                const url = pitchSheetUrl(base, s.token);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium text-[var(--ink)]">{s.brandName}</div>
                      <div className="text-xs text-[var(--muted-2)]">
                        {s.brandEmail ?? "No email saved"} · made {when(s.createdAt)}
                      </div>
                    </td>
                    <td className="text-xs max-w-[260px]">
                      <div className="font-medium text-[var(--ink)]">{names.length} creator{names.length === 1 ? "" : "s"}</div>
                      <div className="text-[var(--muted-2)] truncate" title={names.join(", ")}>
                        {names.join(", ")}
                      </div>
                    </td>
                    <td className="text-xs">
                      <span
                        className="badge"
                        style={
                          state === "live"
                            ? { background: "var(--success-bg)", color: "var(--success-fg)" }
                            : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
                        }
                      >
                        {state === "live" ? (left === null ? "Live · never expires" : `Live · ${left} day${left === 1 ? "" : "s"} left`) : state === "expired" ? `Expired ${when(s.expiresAt)}` : "Turned off"}
                      </span>
                      <div className="mt-1 font-mono text-[11px] text-[var(--muted-2)] truncate max-w-[240px]" title={url}>
                        {url.replace(/^https?:\/\//, "")}
                      </div>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      <div className="text-[var(--ink)] font-medium tabular">
                        {s.viewCount} view{s.viewCount === 1 ? "" : "s"}
                      </div>
                      <div className="text-[var(--muted-2)]">{s.lastViewedAt ? `last ${when(s.lastViewedAt)}` : "Not opened yet"}</div>
                    </td>
                    <td>
                      <PitchSheetActions
                        id={s.id}
                        url={url}
                        state={state}
                        brandName={s.brandName}
                        brandEmail={s.brandEmail}
                        creatorNames={names}
                        items={s.items.map((i) => ({ id: i.id, name: i.creator.channelName ?? i.creator.name }))}
                        expiresAt={s.expiresAt?.toISOString() ?? null}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
