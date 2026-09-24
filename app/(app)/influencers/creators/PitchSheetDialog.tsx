"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, FileChartColumn, Link2, Loader2, Mail, X } from "lucide-react";
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { EXPIRY_CHOICES, brandEmailDraft, brandRateFromQuote, gmailComposeUrl, notReadyReason } from "@/lib/pitchSheet";
import type { RosterRow } from "./CreatorsTable";

const MARGIN_KEY = "fidem_pitch_sheet_margin";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MEDIA_KIT_BATCH = 3;

interface RowDraft {
  deliverable: string;
  brandRate: string;
  currency: string;
  rateNote: string;
  hasKit: boolean;
}

interface Created {
  url: string;
  csvUrl: string;
  expiresAt: string | null;
  included: number;
  skipped: { name: string; reason: string }[];
}

function savedMargin(): string {
  try {
    return localStorage.getItem(MARGIN_KEY) ?? "25";
  } catch {
    return "25";
  }
}

function priceFor(row: RosterRow, margin: string): string {
  const value = brandRateFromQuote(row.rate?.amount ?? null, Number(margin));
  return value === null ? "" : String(value);
}

/**
 * Turn the selected creators into one no-login link for a brand — their channel, media kit and
 * the price we quote. Nothing is emailed from here: the team gets the link and a ready-made email
 * to send the brand themselves.
 */
export default function PitchSheetDialog({ rows, onClose }: { rows: RosterRow[]; onClose: () => void }) {
  const ready = useMemo(() => rows.filter((r) => r.readyToPitch), [rows]);
  const leftOut = useMemo(() => rows.filter((r) => !r.readyToPitch), [rows]);

  const [brandName, setBrandName] = useState("");
  const [brandEmail, setBrandEmail] = useState("");
  const [days, setDays] = useState<number>(30);
  const [margin, setMargin] = useState(savedMargin);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(
      ready.map((r) => [
        r.id,
        { deliverable: r.rate?.deliverable ?? "", brandRate: priceFor(r, savedMargin()), currency: r.rate?.currency ?? "USD", rateNote: "", hasKit: !!r.mediaKitToken },
      ])
    )
  );
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const missingKits = ready.filter((r) => !drafts[r.id]?.hasKit && r.hasChannel);

  function setDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function applyMargin() {
    try {
      localStorage.setItem(MARGIN_KEY, margin);
    } catch {
      // Remembering the margin is a convenience only.
    }
    setDrafts((d) => Object.fromEntries(ready.map((r) => [r.id, { ...d[r.id], brandRate: priceFor(r, margin) }])));
  }

  async function makeMissingKits() {
    const ids = missingKits.map((r) => r.id);
    setError(null);
    for (let i = 0; i < ids.length; i += MEDIA_KIT_BATCH) {
      setWorking(`Making media kits… ${i}/${ids.length}`);
      try {
        const res = await fetch("/api/influencers/creators/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "media-kit", creatorIds: ids.slice(i, i + MEDIA_KIT_BATCH) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't make the media kits");
        for (const r of data.results as { creatorId?: string; ok: boolean }[]) if (r.ok && r.creatorId) setDraft(r.creatorId, { hasKit: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't make the media kits");
        break;
      }
    }
    setWorking(null);
  }

  async function generate() {
    setError(null);
    setWorking("Making the link…");
    try {
      const res = await fetch("/api/pitch-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          brandEmail: brandEmail.trim() || undefined,
          expiresInDays: days,
          items: ready.map((r) => {
            const d = drafts[r.id];
            const price = Number(d.brandRate.replace(/[,$\s]/g, ""));
            return {
              creatorId: r.id,
              brandRate: d.brandRate.trim() && Number.isFinite(price) ? price : null,
              brandRateCurrency: d.currency,
              deliverable: d.deliverable,
              rateNote: d.rateNote,
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't make the link");
      setCreated(data);
      setEmail(brandEmailDraft({ brandName: brandName.trim(), url: data.url, creatorNames: ready.map((r) => r.name), expiresAt: data.expiresAt }));
      await copy("link", data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the link");
    } finally {
      setWorking(null);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      // Clipboard can be blocked; the text is still selectable on screen.
    }
  }

  const brandEmailValid = !brandEmail.trim() || EMAIL_RE.test(brandEmail.trim());
  const canGenerate = ready.length > 0 && !!brandName.trim() && brandEmailValid && !working;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={working ? undefined : onClose} />
      <div className="relative card w-full max-w-3xl max-h-[92vh] flex flex-col shadow-xl" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[15px] text-[var(--ink)]">{created ? "Pitch sheet link ready" : "Make a pitch sheet link"}</h2>
          <button onClick={onClose} disabled={!!working} className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {created && email ? (
            <>
              <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--success-fg)" }}>
                <CheckCircle2 size={16} /> {created.included} creator{created.included === 1 ? "" : "s"} on the sheet
                {created.expiresAt ? ` · link open until ${new Date(created.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : " · link never expires"}
              </p>

              <Field label="Link for the brand">
                <div className="flex gap-2">
                  <input readOnly className="input font-mono text-xs" value={created.url} onFocus={(e) => e.target.select()} />
                  <button onClick={() => void copy("link", created.url)} className="btn-primary inline-flex items-center gap-1.5 px-3 text-xs whitespace-nowrap">
                    {copied === "link" ? <Check size={13} /> : <Copy size={13} />} {copied === "link" ? "Copied" : "Copy"}
                  </button>
                  <a href={created.url} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center px-3" aria-label="Open what the brand sees">
                    <ExternalLink size={14} />
                  </a>
                </div>
              </Field>

              <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--muted)]">Email to {brandName.trim()} — edit, then send it yourself</span>
                  <div className="flex gap-2">
                    <button onClick={() => void copy("email", `${email.subject}\n\n${email.body}`)} className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
                      {copied === "email" ? <Check size={12} /> : <Copy size={12} />} Copy
                    </button>
                    <a
                      href={gmailComposeUrl(brandEmail.trim() || null, email.subject, email.body)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
                    >
                      <Mail size={12} /> Open in Gmail
                    </a>
                  </div>
                </div>
                <input className="input py-1.5 text-sm font-medium" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
                <textarea className="input font-sans text-sm leading-relaxed" style={{ minHeight: 200, resize: "vertical" }} value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
              </div>

              <Field label="Live Google Sheet (optional)" hint="Paste into cell A1 of a Google Sheet — it fills with this shortlist and refreshes itself until the link expires.">
                <div className="flex gap-2">
                  <input readOnly className="input font-mono text-xs" value={`=IMPORTDATA("${created.csvUrl}")`} onFocus={(e) => e.target.select()} />
                  <button onClick={() => void copy("sheet", `=IMPORTDATA("${created.csvUrl}")`)} className="btn-secondary inline-flex items-center gap-1.5 px-3 text-xs">
                    {copied === "sheet" ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              </Field>

              {created.skipped.length > 0 && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
                  Left out: {created.skipped.map((s) => s.name).join(", ")} — {created.skipped[0].reason.toLowerCase()}.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Brand name">
                  <input className="input" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="ChitaLiving" maxLength={120} autoFocus />
                </Field>
                <Field label="Brand's email (optional)" hint="Only used to address the email you'll send them">
                  <input
                    className="input"
                    value={brandEmail}
                    onChange={(e) => setBrandEmail(e.target.value)}
                    placeholder="partnerships@brand.com"
                    style={!brandEmailValid ? { borderColor: "var(--danger-fg)" } : undefined}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <span className="block text-xs font-medium text-[var(--muted)] mb-1">Link expires after</span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPIRY_CHOICES.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDays(d)}
                        className="px-2.5 py-1 rounded-full text-xs font-medium border"
                        style={
                          days === d
                            ? { background: "var(--brand-teal-dark)", color: "white", borderColor: "var(--brand-teal-dark)" }
                            : { borderColor: "var(--border)", color: "var(--muted)" }
                        }
                      >
                        {d === 0 ? "Never" : `${d} days`}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-medium text-[var(--muted)] mb-1">Your margin on their rate</span>
                  <div className="flex items-center gap-1.5">
                    <input className="input py-1 text-sm" style={{ width: 64 }} inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value)} aria-label="Margin percent" />
                    <span className="text-sm text-[var(--muted)]">%</span>
                    <button onClick={applyMargin} className="btn-secondary px-2.5 py-1 text-xs">
                      Apply to all
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium text-[var(--ink)]">
                    {ready.length} of {rows.length} on the sheet
                  </span>
                  {missingKits.length > 0 && (
                    <button onClick={() => void makeMissingKits()} disabled={!!working} className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs disabled:opacity-40">
                      <FileChartColumn size={12} /> Make {missingKits.length} missing media kit{missingKits.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                  {ready.map((r) => {
                    const d = drafts[r.id];
                    return (
                      <div key={r.id} className="p-3 flex flex-wrap items-center gap-3">
                        <Avatar row={r} />
                        <div className="flex-1 min-w-[160px]">
                          <div className="text-sm font-medium text-[var(--ink)] truncate">{r.name}</div>
                          <div className="text-[11px] text-[var(--muted-2)]">
                            {r.rate ? `They quoted ${formatMoney(r.rate.amount, r.rate.currency)}${r.rate.deliverable ? ` · ${r.rate.deliverable}` : ""}` : "Replied · no rate yet"}
                            {" · "}
                            {d.hasKit ? "media kit ✓" : <span style={{ color: "var(--warn-fg)" }}>no media kit</span>}
                          </div>
                        </div>
                        <input className="input py-1.5 text-xs" style={{ width: 150 }} value={d.deliverable} onChange={(e) => setDraft(r.id, { deliverable: e.target.value })} placeholder="Dedicated video" aria-label={`Deliverable for ${r.name}`} />
                        <div className="flex items-center gap-1">
                          <input
                            className="input py-1.5 text-xs"
                            style={{ width: 90 }}
                            inputMode="numeric"
                            value={d.brandRate}
                            onChange={(e) => setDraft(r.id, { brandRate: e.target.value })}
                            placeholder="Brand rate"
                            aria-label={`Rate shown to the brand for ${r.name}`}
                            title="The price the brand sees — their own quote is never shown"
                          />
                          <span className="text-[11px] text-[var(--muted-2)] w-7">{d.currency}</span>
                        </div>
                        <input className="input py-1.5 text-xs w-full sm:w-auto sm:flex-1" value={d.rateNote} onChange={(e) => setDraft(r.id, { rateNote: e.target.value })} placeholder="Note for the brand, e.g. + product" aria-label={`Rate note for ${r.name}`} />
                      </div>
                    );
                  })}
                  {leftOut.map((r) => (
                    <div key={r.id} className="p-3 flex items-center gap-3 opacity-60">
                      <Avatar row={r} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--ink)] truncate">{r.name}</div>
                        <div className="text-[11px]" style={{ color: "var(--warn-fg)" }}>
                          Left out — {notReadyReason({ replied: !!r.outreach?.replied, hasRate: !!r.rate })?.toLowerCase()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--muted-2)] mt-2">
                  The brand sees each creator&apos;s channel, media kit and the rate in the brand-rate box. Their own quote, email and your notes stay private.
                </p>
              </div>
            </>
          )}

          {working && (
            <p className="text-sm text-[var(--muted)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {working}
            </p>
          )}
          {error && (
            <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[var(--border)]">
          {created ? (
            <button onClick={onClose} className="btn-primary px-4 py-2 text-sm ml-auto">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={!!working} className="btn-secondary px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={() => void generate()}
                disabled={!canGenerate}
                className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-40"
                title={ready.length === 0 ? "None of these creators has replied or given a rate" : !brandName.trim() ? "Enter the brand's name" : ""}
              >
                <Link2 size={14} /> Make link ({ready.length})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ row }: { row: RosterRow }) {
  return row.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar
    <img src={row.thumbnailUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold" style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}>
      {row.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1">
      <span className="block text-xs font-medium text-[var(--muted)] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--muted-2)] mt-1">{hint}</span>}
    </label>
  );
}
