"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Save } from "lucide-react";

const PLATFORM_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/handle" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@handle" },
  { key: "twitter", label: "Twitter/X", placeholder: "https://x.com/handle" },
  { key: "pinterest", label: "Pinterest", placeholder: "https://pinterest.com/handle" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/handle" },
  { key: "amazonStorefront", label: "Amazon storefront", placeholder: "https://amazon.com/shop/handle" },
];

interface CreatorDetail {
  id: string;
  name: string;
  channelUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  email: string | null;
  notes: string | null;
  platformLinks: Record<string, string>;
  subscriberCount: number | null;
  country: string | null;
}

/**
 * The full "media" view for one saved creator — everything Discovery knows about them in one
 * place, not scattered across a compact card's badges. This is also where a platform link
 * extraction missed (or an email that needs correcting) gets filled in by hand, since regex
 * extraction is a strong first pass, not a guarantee.
 */
export default function CreatorDetailModal({
  creatorId,
  onClose,
  onSaved,
}: {
  creatorId: string;
  onClose: () => void;
  onSaved?: (patch: { email: string | null; platformLinks: Record<string, string> }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [platformLinks, setPlatformLinks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/discovery/${creatorId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load this creator");
        if (cancelled) return;
        setDetail(data.creator);
        setEmail(data.creator.email ?? "");
        setNotes(data.creator.notes ?? "");
        setPlatformLinks(data.creator.platformLinks ?? {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this creator");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/${creatorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || null, notes: notes.trim() || null, platformLinks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save");
      setSaved(true);
      // Empty-string platform values were cleared server-side — reflect that back so a re-open
      // doesn't show a stale blank field as if it were still saved.
      const cleaned = Object.fromEntries(Object.entries(platformLinks).filter(([, v]) => !!v));
      setPlatformLinks(cleaned);
      onSaved?.({ email: email.trim() || null, platformLinks: cleaned });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col card shadow-xl"
        style={{ boxShadow: "var(--shadow-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-sm font-semibold text-[var(--ink)]">{detail?.name ?? "Creator"}</span>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded text-[var(--muted)] hover:bg-[var(--bg)]">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[var(--muted-2)]" />
          </div>
        ) : !detail ? (
          <div className="p-6 text-sm text-[var(--danger-fg)]">{error ?? "Couldn't load this creator"}</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
            {detail.description && (
              <div>
                <label className="block text-xs font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1">
                  Channel description
                </label>
                <p className="whitespace-pre-wrap text-[13px] text-[var(--ink)] rounded-lg p-2.5" style={{ background: "var(--bg)" }}>
                  {detail.description}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1">Contact email</label>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="No email found — add one" />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">
                Social media &amp; storefronts
              </label>
              <div className="space-y-1.5">
                {PLATFORM_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-[var(--muted)]">{f.label}</span>
                    <input
                      className="input py-1.5 text-xs flex-1"
                      placeholder={f.placeholder}
                      value={platformLinks[f.key] ?? ""}
                      onChange={(e) => setPlatformLinks((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--muted-2)] mt-1">
                Auto-detected from their YouTube description where possible — add or fix any of these by hand.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1">Notes</label>
              <textarea
                className="input font-sans"
                style={{ minHeight: 80, resize: "vertical" }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything worth remembering about this creator…"
              />
            </div>

            {error && (
              <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
                {error}
              </p>
            )}
          </div>
        )}

        {detail && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] shrink-0">
            <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-xs" style={{ color: "var(--success-fg)" }}>Saved</span>}
          </div>
        )}
      </div>
    </div>
  );
}
