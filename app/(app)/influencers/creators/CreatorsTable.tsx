"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, FileChartColumn, Loader2, MailSearch, Pencil, Send, Download } from "lucide-react";
import CreatorDetailModal from "../../discovery/CreatorDetailModal";
import { StageBadge } from "@/app/components/Badge";
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { ROSTER_PLATFORMS } from "@/lib/creatorRoster";
import BulkPitchDialog, { type PitchCreator } from "./BulkPitchDialog";

export interface RosterRow {
  id: string;
  name: string;
  channelUrl: string | null;
  thumbnailUrl: string | null;
  country: string | null;
  niche: string | null;
  contentHighlights: string | null;
  subscriberCount: number | null;
  averageViews: number | null;
  engagementRate: number | null;
  hasChannel: boolean;
  email: string | null;
  emailSource: string | null;
  emailCheckedAt: string | null;
  platformLinks: Record<string, string>;
  websiteLinks: string[];
  rate: { amount: number; currency: string | null; deliverable: string | null; at: string | null } | null;
  outreach: { sequenceId: string; stage: string; status: string; replied: boolean; awaiting: boolean; contactedAt: string } | null;
  mediaKitToken: string | null;
  mediaKitGeneratedAt: string | null;
  mediaKitQueued: boolean;
}

const EMAIL_BATCH = 9;
const MEDIA_KIT_BATCH = 3;

function compact(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function shortDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

/** The roster table: select creators, then look up emails, make media kits, export or pitch them. */
export default function CreatorsTable({ rows, totalMatching }: { rows: RosterRow[]; totalMatching: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pitching, setPitching] = useState<PitchCreator[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = rows.filter((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAction(action: "find-email" | "media-kit", ids: string[]) {
    if (ids.length === 0 || busy) return;
    const batch = action === "find-email" ? EMAIL_BATCH : MEDIA_KIT_BATCH;
    setMessage(null);
    setBusy({ label: action === "find-email" ? "Looking for emails" : "Making media kits", done: 0, total: ids.length });
    let found = 0;
    let ok = 0;
    let failed = 0;
    let lastError = "";
    try {
      for (let i = 0; i < ids.length; i += batch) {
        const res = await fetch("/api/influencers/creators/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, creatorIds: ids.slice(i, i + batch) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Something went wrong");
        for (const r of data.results as { ok: boolean; found?: boolean; error?: string }[]) {
          if (r.ok) ok++;
          else {
            failed++;
            lastError = r.error ?? lastError;
          }
          if (r.found) found++;
        }
        setBusy((b) => (b ? { ...b, done: Math.min(ids.length, i + batch) } : b));
      }
      setMessage({
        tone: failed > 0 && ok === 0 ? "error" : "ok",
        text:
          action === "find-email"
            ? `Checked ${ok + failed} creator${ok + failed === 1 ? "" : "s"} — found ${found} new email${found === 1 ? "" : "s"}.${failed ? ` ${failed} couldn't be checked.` : ""}${found < ok ? " The rest don't publish one outside YouTube's hidden button." : ""}`
            : `${ok} media kit${ok === 1 ? "" : "s"} ready.${failed ? ` ${failed} failed: ${lastError}` : ""}`,
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function copyKitLink(row: RosterRow) {
    if (!row.mediaKitToken) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/media-kit/shared/${row.mediaKitToken}`);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId((id) => (id === row.id ? null : id)), 2000);
    } catch {
      // Clipboard can be blocked; the Open link still works.
    }
  }

  const toPitch = (list: RosterRow[]): PitchCreator[] =>
    list.map((r) => ({ id: r.id, name: r.name, email: r.email, thumbnailUrl: r.thumbnailUrl, channelUrl: r.channelUrl }));

  return (
    <div className="space-y-3">
      <div className="card px-4 py-3 flex items-center gap-2 flex-wrap text-sm">
        <span className="text-[var(--muted)] mr-auto">
          {selected.size > 0 ? `${selected.size} selected` : `${totalMatching} creator${totalMatching === 1 ? "" : "s"} — select some to act on them`}
        </span>
        <button
          onClick={() => setPitching(toPitch(selectedRows))}
          disabled={selected.size === 0 || !!busy}
          className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <Send size={13} /> Pitch selected
        </button>
        <button
          onClick={() => void runAction("find-email", selectedRows.filter((r) => !r.email).map((r) => r.id))}
          disabled={selectedRows.every((r) => !!r.email) || !!busy}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
          title="Look for business emails on the pages these creators publish"
        >
          <MailSearch size={13} /> Find emails
        </button>
        <button
          onClick={() => void runAction("media-kit", selectedRows.filter((r) => r.hasChannel).map((r) => r.id))}
          disabled={!selectedRows.some((r) => r.hasChannel) || !!busy}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <FileChartColumn size={13} /> Make media kits
        </button>
        <a
          href={selected.size > 0 ? `/api/influencers/creators/export?ids=${[...selected].join(",")}` : undefined}
          aria-disabled={selected.size === 0}
          className={`btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${selected.size === 0 ? "pointer-events-none opacity-40" : ""}`}
        >
          <Download size={13} /> Export selected
        </a>
      </div>

      {(busy || message) && (
        <div
          className="rounded-lg px-4 py-2.5 text-sm flex items-center gap-2"
          style={
            message?.tone === "error" && !busy
              ? { background: "var(--danger-bg)", color: "var(--danger-fg)" }
              : { background: "var(--info-bg)", color: "var(--info-fg)" }
          }
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" /> {busy.label}… {busy.done}/{busy.total}
            </>
          ) : (
            message?.text
          )}
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[1080px]">
          <thead className="text-[var(--muted)] text-left">
            <tr className="border-b border-[var(--border)]">
              <th className="px-3 py-3 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </th>
              {["Creator", "Audience", "Email", "Platforms", "Rate", "Outreach", "Media kit", ""].map((label) => (
                <th key={label} className="px-3 py-3 font-medium text-xs uppercase tracking-wide">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-14 text-center text-[var(--muted-2)]">
                  No creators match. Creators appear here once Discovery saves them or you pitch them.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const platforms = ROSTER_PLATFORMS.filter((p) => row.platformLinks[p.key]);
              return (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0 align-top hover:bg-[var(--bg)]">
                  <td className="px-3 py-3">
                    <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2.5 min-w-[200px] max-w-[260px]">
                      {row.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar
                        <img src={row.thumbnailUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold" style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}>
                          {row.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-[var(--ink)] truncate">{row.name}</span>
                          {row.channelUrl && (
                            <a href={row.channelUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--muted-2)] hover:text-[var(--ink)] shrink-0" title="Open channel">
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-[var(--muted-2)] truncate" title={row.contentHighlights ?? row.niche ?? ""}>
                          {[row.country, row.contentHighlights ?? row.niche].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    <div className="text-[var(--ink)] font-medium">{compact(row.subscriberCount)} subs</div>
                    <div className="text-[var(--muted-2)]">
                      {compact(row.averageViews)} avg views{row.engagementRate !== null ? ` · ${row.engagementRate.toFixed(1)}% ER` : ""}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-xs max-w-[220px]">
                    {row.email ? (
                      <>
                        <div className="text-[var(--ink)] truncate" title={row.email}>
                          {row.email}
                        </div>
                        {row.emailSource && <div className="text-[var(--muted-2)] truncate" title={row.emailSource}>from {row.emailSource}</div>}
                      </>
                    ) : (
                      <>
                        <div className="text-[var(--muted-2)]">
                          {row.emailCheckedAt ? `Not published outside YouTube · checked ${shortDate(row.emailCheckedAt)}` : row.hasChannel ? "Queued for email search" : "No email"}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => void runAction("find-email", [row.id])} disabled={!!busy} className="font-medium disabled:opacity-40" style={{ color: "var(--brand-teal-dark)" }}>
                            {row.emailCheckedAt ? "Search again" : "Search now"}
                          </button>
                          {row.channelUrl && (
                            <a href={`${row.channelUrl.replace(/\/+$/, "")}/about`} target="_blank" rel="noopener noreferrer" className="text-[var(--muted)] hover:text-[var(--ink)]">
                              About page
                            </a>
                          )}
                        </div>
                      </>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {platforms.length === 0 && row.websiteLinks.length === 0 ? (
                      <span className="text-xs text-[var(--muted-2)]">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-w-[170px]">
                        {platforms.map((p) => (
                          <a
                            key={p.key}
                            href={row.platformLinks[p.key]}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={row.platformLinks[p.key]}
                            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}
                          >
                            {p.label}
                          </a>
                        ))}
                        {row.websiteLinks.slice(0, 1).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer" title={url} className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}>
                            Website
                          </a>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    {row.rate ? (
                      <>
                        <div className="font-semibold text-[var(--ink)]">{formatMoney(row.rate.amount, row.rate.currency)}{row.rate.currency ? "" : " (no currency)"}</div>
                        <div className="text-[var(--muted-2)]">
                          {[row.rate.deliverable, shortDate(row.rate.at)].filter(Boolean).join(" · ")}
                        </div>
                      </>
                    ) : (
                      <span className="text-[var(--muted-2)]">—</span>
                    )}
                  </td>

                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    {row.outreach ? (
                      <Link href={`/dashboard/${row.outreach.sequenceId}`} className="inline-flex flex-col gap-1 items-start">
                        <StageBadge stage={row.outreach.stage} />
                        <span className="text-[var(--muted-2)]">
                          {row.outreach.awaiting ? "Needs your reply" : row.outreach.replied ? "Replied" : `Pitched ${shortDate(row.outreach.contactedAt)}`}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-[var(--muted-2)]">Not contacted</span>
                    )}
                  </td>

                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    {row.mediaKitToken ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <a href={`/media-kit/shared/${row.mediaKitToken}`} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: "var(--brand-teal-dark)" }}>
                            Open
                          </a>
                          <button onClick={() => void copyKitLink(row)} className="inline-flex items-center gap-1 text-[var(--muted)] hover:text-[var(--ink)]">
                            {copiedId === row.id ? <Check size={12} /> : <Copy size={12} />} {copiedId === row.id ? "Copied" : "Copy link"}
                          </button>
                        </div>
                        <span className="text-[var(--muted-2)]">Made {shortDate(row.mediaKitGeneratedAt)}</span>
                      </div>
                    ) : row.mediaKitQueued ? (
                      <span className="text-[var(--muted-2)]">Being made…</span>
                    ) : row.hasChannel ? (
                      <button onClick={() => void runAction("media-kit", [row.id])} disabled={!!busy} className="font-medium disabled:opacity-40" style={{ color: "var(--brand-teal-dark)" }}>
                        Make one
                      </button>
                    ) : (
                      <span className="text-[var(--muted-2)]">No channel</span>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setPitching(toPitch([row]))} className="p-1.5 rounded text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]" title="Pitch this creator">
                        <Send size={14} />
                      </button>
                      <button onClick={() => setDetailId(row.id)} className="p-1.5 rounded text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]" title="Edit email, platforms and notes">
                        <Pencil size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailId && <CreatorDetailModal creatorId={detailId} onClose={() => setDetailId(null)} onSaved={() => router.refresh()} />}
      {pitching && (
        <BulkPitchDialog
          creators={pitching}
          onClose={() => setPitching(null)}
          onDone={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
