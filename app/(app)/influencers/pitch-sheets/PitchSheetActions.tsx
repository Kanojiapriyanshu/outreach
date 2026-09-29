"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Mail, Users, X } from "lucide-react";
import { brandEmailDraft, gmailComposeUrl, type LinkState } from "@/lib/pitchSheet";

/** Row actions on the Pitch sheets tab: copy/open the link, email the brand, take creators off the
 * sheet, extend or turn it off. */
export default function PitchSheetActions({
  id,
  url,
  state,
  brandName,
  brandEmail,
  creatorNames,
  expiresAt,
  items,
}: {
  id: string;
  url: string;
  state: LinkState;
  brandName: string;
  brandEmail: string | null;
  creatorNames: string[];
  expiresAt: string | null;
  items: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editError, setEditError] = useState("");

  async function removeItem(item: { id: string; name: string }) {
    if (!confirm(`Take ${item.name} off ${brandName}'s sheet? They disappear from the brand's link straight away.`)) return;
    setRemovingId(item.id);
    setEditError("");
    try {
      const res = await fetch(`/api/pitch-sheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-item", itemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't remove this creator");
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't remove this creator");
    } finally {
      setRemovingId(null);
    }
  }

  async function change(action: "extend" | "turn-off") {
    if (action === "turn-off" && !confirm(`Turn off ${brandName}'s link now? They'll see "no longer available".`)) return;
    setBusy(true);
    try {
      await fetch(`/api/pitch-sheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days: 30 }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; Open still works.
    }
  }

  const email = brandEmailDraft({ brandName, url, creatorNames, expiresAt });

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap text-xs">
      <button onClick={() => setEditing(true)} className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5" title="See or remove the creators on this sheet">
        <Users size={12} /> Creators
      </button>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 text-left">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(false)} />
          <div className="relative card w-full max-w-md max-h-[80vh] flex flex-col" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold text-sm text-[var(--ink)]">
                {brandName} · {items.length} creator{items.length === 1 ? "" : "s"}
              </h3>
              <button onClick={() => setEditing(false)} className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)]" aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-[var(--border)]">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm text-[var(--ink)] truncate">{item.name}</span>
                  <button
                    onClick={() => void removeItem(item)}
                    disabled={!!removingId || items.length === 1}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded disabled:opacity-40"
                    style={{ color: "var(--danger-fg)" }}
                    title={items.length === 1 ? "A sheet needs at least one creator — turn the link off instead" : "Remove from this sheet"}
                  >
                    {removingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Remove
                  </button>
                </div>
              ))}
            </div>
            <p className="px-4 py-2.5 text-[11px] text-[var(--muted-2)] border-t border-[var(--border)]">
              {editError ? <span style={{ color: "var(--danger-fg)" }}>{editError}</span> : "Changes show on the brand's link immediately — no need to send a new one."}
            </p>
          </div>
        </div>
      )}
      {state === "live" ? (
        <>
          <button onClick={() => void copy()} className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center px-2 py-1.5" aria-label="Open the brand's view">
            <ExternalLink size={12} />
          </a>
          <a
            href={gmailComposeUrl(brandEmail, email.subject, email.body)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5"
            title="Opens a Gmail draft to the brand — nothing is sent until you press Send"
          >
            <Mail size={12} /> Email brand
          </a>
          <button onClick={() => void change("extend")} disabled={busy} className="font-medium disabled:opacity-40" style={{ color: "var(--brand-teal-dark)" }}>
            +30 days
          </button>
          <button onClick={() => void change("turn-off")} disabled={busy} className="font-medium text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40">
            Turn off
          </button>
        </>
      ) : (
        <button onClick={() => void change("extend")} disabled={busy} className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 disabled:opacity-40">
          {busy && <Loader2 size={12} className="animate-spin" />} Re-open for 30 days
        </button>
      )}
    </div>
  );
}
