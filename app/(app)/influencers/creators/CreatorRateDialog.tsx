"use client";

import { useState } from "react";
import { Lock, Plus, Trash2, X } from "lucide-react";
import type { RosterRow } from "./CreatorsTable";

const CURRENCIES = ["USD", "GBP", "EUR", "INR", "CAD", "AUD"];

interface Line {
  deliverable: string;
  amount: string;
  currency: string;
}

const blank = (currency = "USD"): Line => ({ deliverable: "", amount: "", currency });

/**
 * One place for a creator's two prices: their real rate card (what they charge us — only changed
 * here, never by an email) and the brand pitch rate (what we quote a brand).
 */
export default function CreatorRateDialog({ row, onClose, onSaved }: { row: RosterRow; onClose: () => void; onSaved: () => void }) {
  const [lines, setLines] = useState<Line[]>(() =>
    row.rateCard.length > 0
      ? row.rateCard.map((r) => ({ deliverable: r.deliverable ?? "", amount: String(r.amount), currency: r.currency ?? "USD" }))
      : [blank()]
  );
  const [note, setNote] = useState(row.rateNote ?? "");
  const [pitch, setPitch] = useState<Line>(() =>
    row.pitchRate
      ? { deliverable: row.pitchRate.deliverable ?? "", amount: String(row.pitchRate.amount), currency: row.pitchRate.currency ?? "USD" }
      : blank(row.rateCard[0]?.currency ?? "USD")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (i: number, patch: Partial<Line>) => setLines((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/influencers/creators/${row.id}/rates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateCard: lines, rateNote: note, pitch: pitch.amount.trim() ? pitch : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the rates");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the rates");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 text-left">
      <div className="absolute inset-0 bg-black/50" onClick={saving ? undefined : onClose} />
      <div className="relative card w-full max-w-xl max-h-[92vh] flex flex-col" style={{ boxShadow: "var(--shadow-pop)" }} role="dialog" aria-label={`Rates for ${row.name}`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[15px] text-[var(--ink)] truncate">Rates · {row.name}</h2>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-slim px-5 py-4 space-y-5">
          <section>
            <h3 className="text-sm font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Lock size={13} /> Real rate
            </h3>
            <p className="text-xs text-[var(--muted-2)] mt-0.5 mb-2.5">What the creator charges you. Only changes when you edit it here — emails never overwrite it. Brands never see it.</p>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input py-1.5 text-[13px] flex-1 min-w-0" value={l.deliverable} onChange={(e) => setLine(i, { deliverable: e.target.value })} placeholder="Dedicated video" aria-label="What the price is for" maxLength={60} />
                  <input className="input py-1.5 text-[13px]" style={{ width: 96 }} inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} placeholder="Price" aria-label="Price" />
                  <select className="input py-1.5 text-[13px]" style={{ width: 78 }} value={l.currency} onChange={(e) => setLine(i, { currency: e.target.value })} aria-label="Currency">
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <button onClick={() => setLines((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [blank()]))} className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]" aria-label="Remove this price">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines((all) => [...all, blank(all.at(-1)?.currency)])} className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--brand-teal-dark)" }}>
              <Plus size={12} /> Add another price
            </button>
            <textarea className="input text-[13px] mt-3" style={{ minHeight: 60, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Terms, e.g. plus the product, usage rights extra" aria-label="Terms for the real rate" maxLength={500} />
            <p className="text-[11px] text-[var(--muted-2)] mt-1">The first price — or the one called “Dedicated video” — is the headline shown in the table.</p>
          </section>

          <section className="pt-4 border-t border-[var(--border)]">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Brand pitch rate</h3>
            <p className="text-xs text-[var(--muted-2)] mt-0.5 mb-2.5">What you quote a brand for this creator. Pre-fills pitch sheets, and updates to the price you last put on one.</p>
            <div className="flex items-center gap-2">
              <input className="input py-1.5 text-[13px] flex-1 min-w-0" value={pitch.deliverable} onChange={(e) => setPitch({ ...pitch, deliverable: e.target.value })} placeholder="Dedicated video" aria-label="What the pitch price is for" maxLength={60} />
              <input className="input py-1.5 text-[13px]" style={{ width: 96 }} inputMode="decimal" value={pitch.amount} onChange={(e) => setPitch({ ...pitch, amount: e.target.value })} placeholder="Price" aria-label="Brand pitch price" />
              <select className="input py-1.5 text-[13px]" style={{ width: 78 }} value={pitch.currency} onChange={(e) => setPitch({ ...pitch, currency: e.target.value })} aria-label="Pitch currency">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </section>

          {error && (
            <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={onClose} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button onClick={() => void save()} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
            {saving ? "Saving…" : "Save rates"}
          </button>
        </div>
      </div>
    </div>
  );
}
