"use client";

import { useState } from "react";
import { Link2, Copy, Check, Loader2 } from "lucide-react";

/** Sits above the report when viewed inside the CRM (never on the public share page itself) —
 * generates/fetches the same public link MediaKitButton offers from Discovery, for when someone
 * is looking at a media kit they already have open rather than starting from the card. */
export default function CopyShareLinkBar({ mediaKitId }: { mediaKitId: string }) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getLink() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/media-kit/${mediaKitId}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create a share link");
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a share link");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied — the link is still visible and selectable in the input.
    }
  }

  return (
    <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2.5 flex items-center gap-2 flex-wrap">
      {!url ? (
        <button onClick={() => void getLink()} disabled={loading} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
          {loading ? "Creating link…" : "Get public link to share"}
        </button>
      ) : (
        <>
          <input readOnly value={url} className="input py-1.5 text-xs flex-1 min-w-[200px] max-w-md" onFocus={(e) => e.target.select()} />
          <button onClick={() => void copy()} className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </>
      )}
      {error && <span className="text-xs" style={{ color: "var(--danger-fg)" }}>{error}</span>}
    </div>
  );
}
