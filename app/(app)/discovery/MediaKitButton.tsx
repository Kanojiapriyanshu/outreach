"use client";

import { useState } from "react";
import { FileChartColumn, Loader2, Copy, Check, ExternalLink, X } from "lucide-react";

/**
 * The "send a brand proof of this creator's performance" action — an Insight OS report with a
 * no-login public link, generated on demand right from a Discovery card instead of needing a
 * separate trip through Insight OS with the channel URL pasted in by hand.
 *
 * One button covers both states: a creator with no report yet gets one generated from their
 * channel (resolves to their latest video automatically, same as pasting the channel URL into
 * Insight OS directly), a creator that already has one just fetches its existing public link —
 * either way, what shows up after is the same "here's the link, send it" popover.
 */
export default function MediaKitButton({
  channelUrl,
  existingReportId,
  onReportCreated,
}: {
  channelUrl: string;
  existingReportId: string | null;
  onReportCreated?: (reportId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reportId, setReportId] = useState<string | null>(existingReportId);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function getOrCreateMediaKit() {
    setLoading(true);
    setError(null);
    try {
      let id = reportId;
      if (!id) {
        const res = await fetch("/api/insights/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: channelUrl }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message ?? "Couldn't generate the media kit");
        id = data.data?.reportId;
        if (!id) throw new Error("Report generated but didn't come back with an id");
        setReportId(id);
        onReportCreated?.(id);
      }

      const shareRes = await fetch(`/api/insights/${id}/share`, { method: "POST" });
      const shareData = await shareRes.json();
      if (!shareRes.ok || !shareData.success) throw new Error(shareData.message ?? "Couldn't create a share link");
      setShareUrl(shareData.data.url);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the media kit");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied in some contexts — the link is still shown and selectable.
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => void getOrCreateMediaKit()}
        disabled={loading}
        title={reportId ? "Get the public media kit link" : "Generate a media kit for this creator"}
        className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileChartColumn size={14} />}
      </button>

      {error && !open && <p className="absolute top-full left-0 mt-1 w-48 text-[11px] z-20" style={{ color: "var(--danger-fg)" }}>{error}</p>}

      {open && shareUrl && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full right-0 mb-2 z-20 w-72 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg space-y-2"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--ink)]">Media kit — share with the brand</span>
              <button onClick={() => setOpen(false)} className="text-[var(--muted-2)] hover:text-[var(--ink)]">
                <X size={13} />
              </button>
            </div>
            <p className="text-[11px] text-[var(--muted-2)]">No login needed — anyone with this link can view the performance report.</p>
            <div className="flex items-center gap-1.5">
              <input readOnly value={shareUrl} className="input py-1.5 text-[11px] flex-1" onFocus={(e) => e.target.select()} />
              <button onClick={() => void copyLink()} title="Copy link" className="btn-secondary p-1.5">
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            {reportId && (
              <a
                href={`/insights/report?reportId=${reportId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-teal-dark)]"
              >
                <ExternalLink size={11} /> View the full report
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
