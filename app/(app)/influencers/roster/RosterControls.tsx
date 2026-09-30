"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";

/** Copy the public roster link — optionally opened on one niche, for a brand in that space. */
export function ShareRosterLink({ url, niches }: { url: string; niches: { tag: string; slug: string; count: number }[] }) {
  const [niche, setNiche] = useState("");
  const [copied, setCopied] = useState(false);
  const link = niche ? `${url}?niche=${niche}` : url;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is selectable on screen.
    }
  }

  return (
    <div className="card p-4 flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">Share with a brand</div>
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="input mt-1.5 font-mono text-xs" aria-label="Public roster link" />
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        {niches.length > 0 && (
          <label className="block">
            <span className="block text-xs text-[var(--muted)] mb-1">Open on a niche</span>
            <select className="input w-auto py-1.5 text-sm" value={niche} onChange={(e) => setNiche(e.target.value)}>
              <option value="">All creators</option>
              {niches.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.tag} ({n.count})
                </option>
              ))}
            </select>
          </label>
        )}
        <button onClick={() => void copy()} className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
        </button>
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center px-3.5 py-2 text-sm">
          Preview
        </a>
      </div>
    </div>
  );
}

/** Show / hide one creator on the public roster. */
export function VisibilityToggle({ creatorId, hidden }: { creatorId: string; hidden: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/influencers/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, hidden: !hidden }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={() => void toggle()}
      disabled={saving}
      className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs whitespace-nowrap"
      title={hidden ? "Show this creator on the public roster" : "Keep this creator off the public roster"}
      style={error ? { borderColor: "var(--danger-fg)", color: "var(--danger-fg)" } : undefined}
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : hidden ? <Eye size={12} /> : <EyeOff size={12} />}
      {error ? "Try again" : hidden ? "Show" : "Hide"}
    </button>
  );
}
