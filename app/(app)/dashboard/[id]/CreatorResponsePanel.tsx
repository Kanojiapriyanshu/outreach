"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareReply, Pencil, Sparkles } from "lucide-react";
import { formatRate, type QuotedRate } from "@/lib/creatorReplyAnalysis";
import { replyIntentLabel } from "@/lib/influencerOutreach";
import { formatDateTime } from "@/lib/formatDate";
import MarkHandledButton from "../../influencers/MarkHandledButton";

const DELIVERABLES = ["Dedicated video", "Integration", "Short-form", "Instagram", "Package"];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

interface Props {
  sequenceId: string;
  status: string;
  lastReplyAt: string | null;
  replyIntent: string | null;
  replySummary: string | null;
  lastReplyText: string | null;
  repliedAfterStep: number | null;
  awaitingSince: string | null;
  rates: QuotedRate[];
  rateNote: string | null;
  /** A check-in is queued — they said they'd get back, or the team wrote back and is waiting again. */
  followUpScheduled: boolean;
}

/** What the creator said and what they quoted — the part of an influencer thread the team acts on. */
export default function CreatorResponsePanel(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [deliverable, setDeliverable] = useState("Dedicated video");
  const [note, setNote] = useState(props.rateNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replied = !!props.lastReplyAt || props.status === "REPLIED" || props.status === "UNSUBSCRIBED";

  async function saveRate(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${props.sequenceId}/rate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save — try again.");
      setEditing(false);
      setAmount("");
      setAmountMax("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  function submitRate() {
    if (!amount.trim() && !note.trim()) {
      setError("Enter an amount or a note.");
      return;
    }
    saveRate({
      amount: amount.trim() ? Number(amount) : null,
      amountMax: amountMax.trim() ? Number(amountMax) : null,
      currency: currency || null,
      deliverable: deliverable || null,
      note: note.trim() || null,
    });
  }

  function clearRates() {
    if (!confirm("Remove every recorded rate for this creator?")) return;
    saveRate({});
  }

  return (
    <div
      className="card p-5 space-y-4"
      style={props.awaitingSince ? { borderColor: "var(--brand-teal)", boxShadow: "inset 3px 0 0 var(--brand-teal)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-sm text-[var(--ink)]">Creator&apos;s reply</h2>
          <p className="text-xs text-[var(--muted-2)] mt-0.5">
            {!replied
              ? "Nothing back yet. Follow-ups stop automatically the moment they reply."
              : props.followUpScheduled
                ? props.replyIntent === "NON_COMMITTAL"
                  ? "They said they'll get back to you — we'll check in automatically if they don't."
                  : "You've written back since their reply — we'll check in automatically if they go quiet."
                : props.repliedAfterStep === null
                  ? "Follow-ups stopped when they replied."
                  : props.repliedAfterStep === 0
                    ? "They replied to the first email — follow-ups stopped."
                    : `They replied after follow-up #${props.repliedAfterStep} — the rest were stopped.`}
          </p>
        </div>
        {props.awaitingSince && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge inline-flex items-center gap-1" style={{ background: "var(--brand-teal)", color: "#fff" }}>
              <MessageSquareReply size={11} /> Needs your reply
            </span>
            <MarkHandledButton sequenceId={props.sequenceId} compact />
          </div>
        )}
      </div>

      {replied && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <span className="font-medium text-[var(--ink)]">{replyIntentLabel(props.replyIntent)}</span>
            {props.lastReplyAt && <span className="text-[var(--muted-2)]">{formatDateTime(new Date(props.lastReplyAt))}</span>}
          </div>
          {props.replySummary && (
            <p className="text-sm text-[var(--ink)] flex gap-1.5">
              <Sparkles size={14} className="shrink-0 mt-0.5 text-[var(--muted-2)]" aria-label="AI summary" />
              {props.replySummary}
            </p>
          )}
          {props.lastReplyText ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--muted)] leading-relaxed max-h-72 overflow-y-auto break-words">
              {props.lastReplyText}
            </pre>
          ) : (
            <p className="text-xs text-[var(--muted-2)]">Open the thread in Gmail to read the full reply.</p>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">Rate</h3>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "var(--brand-teal-dark)" }}
            >
              <Pencil size={12} /> {props.rates.length > 0 ? "Update rate" : "Record a rate"}
            </button>
          )}
        </div>

        {props.rates.length === 0 && !props.rateNote && !editing && (
          <p className="text-sm text-[var(--muted-2)]">No rate yet.</p>
        )}

        {props.rates.length > 0 && (
          <ul className="space-y-1.5">
            {props.rates.map((rate, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 flex-wrap text-sm">
                <span className="font-semibold text-[var(--ink)]">{formatRate(rate)}</span>
                <span className="text-xs text-[var(--muted-2)]">
                  {rate.source === "manual" ? "Entered by hand" : rate.raw ? <>From their reply: &ldquo;{rate.raw}&rdquo;</> : "From their reply"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {props.rateNote && !editing && <p className="text-sm text-[var(--ink)] mt-2">{props.rateNote}</p>}

        {editing && (
          <div className="space-y-3 mt-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Field label="Amount">
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1200" />
              </Field>
              <Field label="Up to (optional)">
                <input className="input" inputMode="decimal" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="1500" />
              </Field>
              <Field label="Currency">
                <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="">Not stated</option>
                </select>
              </Field>
              <Field label="For">
                <select className="input" value={deliverable} onChange={(e) => setDeliverable(e.target.value)}>
                  {DELIVERABLES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="">Not stated</option>
                </select>
              </Field>
            </div>
            <Field label="Note (optional)">
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. includes 30 days of usage rights"
                maxLength={300}
              />
            </Field>
            {error && (
              <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
                {error}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={submitRate} disabled={saving} className="btn-primary px-4 py-2 text-sm">
                {saving ? "Saving…" : "Save rate"}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving} className="btn-secondary px-4 py-2 text-sm">
                Cancel
              </button>
              {(props.rates.length > 0 || props.rateNote) && (
                <button onClick={clearRates} disabled={saving} className="ml-auto text-xs font-medium" style={{ color: "var(--danger-fg)" }}>
                  Clear all rates
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--muted)] mb-1">{label}</span>
      {children}
    </label>
  );
}
