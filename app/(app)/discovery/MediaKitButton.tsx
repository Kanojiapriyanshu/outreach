"use client";

import { useState } from "react";
import { FileChartColumn, Loader2, Copy, Check, ExternalLink, X } from "lucide-react";

/**
 * The "send a brand proof of this creator's performance" action — a whole-channel media kit
 * (subscriber/engagement trends, top videos, an AI-written pitch) with a no-login public link,
 * generated on demand right from a Discovery card. Deliberately channel-level, not the per-video
 * Insight OS report (that answers "did this one upload do well"; a brand deciding whether to work
 * with this creator at all wants "how does the whole channel perform").
 *
 * Regenerates fresh on every click — never reuses an old row, even if one already exists for this
 * channel, since numbers drift and a brand should never see stale performance data.
 */
export default function MediaKitButton({
  creatorId,
  onMediaKitCreated,
}: {
  creatorId?: string;
  onMediaKitCreated?: (mediaKitId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mediaKitId, setMediaKitId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generateMediaKit() {
    if (!creatorId) return;
    setLoading(true);
    setError(null);
    try {
      // Always fresh, never reused — subscriber count and engagement drift, and a brand looking
      // at "current performance" should never be shown numbers from whenever this happened to be
      // generated last. Generation is cheap (a handful of API calls), unlike Discovery's own
      // search — there's no real cost reason to cache this document.
      const res = await fetch("/api/media-kit/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Couldn't generate the media kit");
      const id = data.mediaKitId;
      if (!id) throw new Error("Media kit generated but didn't come back with an id");
      setMediaKitId(id);
      onMediaKitCreated?.(id);

      const shareRes = await fetch(`/api/media-kit/${id}/share`, { method: "POST" });
      const shareData = await shareRes.json();
      if (!shareRes.ok || !shareData.success) throw new Error(shareData.error ?? "Couldn't create a share link");
      setShareUrl(shareData.url);
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
        onClick={() => void generateMediaKit()}
        disabled={loading || !creatorId}
        title="Generate a fresh whole-channel media kit for this creator"
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
            <p className="text-[11px] text-[var(--muted-2)]">No login needed — anyone with this link can view the channel's performance.</p>
            <div className="flex items-center gap-1.5">
              <input readOnly value={shareUrl} className="input py-1.5 text-[11px] flex-1" onFocus={(e) => e.target.select()} />
              <button onClick={() => void copyLink()} title="Copy link" className="btn-secondary p-1.5">
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            {mediaKitId && (
              <a
                href={`/media-kit/${mediaKitId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-teal-dark)]"
              >
                <ExternalLink size={11} /> View the full media kit
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
