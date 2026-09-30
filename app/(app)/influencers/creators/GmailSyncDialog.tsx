"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MailSearch, X } from "lucide-react";
import { formatRate, type CreatorReplyIntent, type QuotedRate } from "@/lib/creatorReplyAnalysis";

interface Candidate {
  gmailThreadId: string;
  subject: string;
  contactName: string;
  contactEmail: string;
  firstSentAt: string;
  lastReplyAt: string;
  replyText: string;
  intent: CreatorReplyIntent;
  rates: QuotedRate[];
  rateNote: string | null;
  channelUrl: string | null;
  match: { creatorId: string; name: string; hasRate: boolean } | null;
  suggestedName: string;
  summary: string | null;
  messageCount: number;
}

type Result = { gmailThreadId: string; ok: true; created: boolean; stage: string; summary: string } | { gmailThreadId: string; ok: false; error: string };

const INTENT: Record<string, { label: string; bg: string; fg: string; pick: boolean }> = {
  RATE_SHARED: { label: "Rate shared", bg: "var(--success-bg)", fg: "var(--success-fg)", pick: true },
  INTERESTED: { label: "Interested", bg: "var(--info-bg)", fg: "var(--info-fg)", pick: true },
  HUMAN_REPLY: { label: "Replied", bg: "var(--info-bg)", fg: "var(--info-fg)", pick: true },
  NON_COMMITTAL: { label: "Will get back", bg: "var(--neutral-bg)", fg: "var(--neutral-fg)", pick: true },
  UNINTERESTED: { label: "Declined", bg: "var(--neutral-bg)", fg: "var(--neutral-fg)", pick: false },
  OPT_OUT: { label: "Opted out", bg: "var(--danger-bg)", fg: "var(--danger-fg)", pick: false },
};

const IMPORT_BATCH = 4;

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Pulls creator conversations you started straight from Gmail into the roster. Scan → review →
 * add. Nothing is sent, and no follow-ups are scheduled for what's imported.
 */
export default function GmailSyncDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [step, setStep] = useState<"setup" | "scanning" | "review" | "importing" | "done">("setup");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setError(null);
    setStep("scanning");
    try {
      const res = await fetch("/api/influencers/gmail-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan", days }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read Gmail");
      const list = data.candidates as Candidate[];
      setCandidates(list);
      setPicked(new Set(list.filter((c) => INTENT[c.intent]?.pick ?? true).map((c) => c.gmailThreadId)));
      setNames(Object.fromEntries(list.map((c) => [c.gmailThreadId, c.match?.name ?? c.suggestedName])));
      setChannels(Object.fromEntries(list.map((c) => [c.gmailThreadId, c.channelUrl ?? ""])));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read Gmail");
      setStep("setup");
    }
  }

  async function importPicked() {
    const chosen = candidates.filter((c) => picked.has(c.gmailThreadId));
    setStep("importing");
    setProgress(0);
    const out: Result[] = [];
    for (let i = 0; i < chosen.length; i += IMPORT_BATCH) {
      const batch = chosen.slice(i, i + IMPORT_BATCH);
      try {
        const res = await fetch("/api/influencers/gmail-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "import",
            items: batch.map((c) => ({ gmailThreadId: c.gmailThreadId, creatorName: names[c.gmailThreadId] ?? c.contactName, channelUrl: channels[c.gmailThreadId] || null })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Import failed");
        out.push(...data.results);
      } catch (err) {
        batch.forEach((c) => out.push({ gmailThreadId: c.gmailThreadId, ok: false, error: err instanceof Error ? err.message : "Import failed" }));
      }
      setProgress(Math.min(chosen.length, i + IMPORT_BATCH));
    }
    setResults(out);
    setStep("done");
    router.refresh();
  }

  const byId = new Map(candidates.map((c) => [c.gmailThreadId, c]));
  const added = results.filter((r) => r.ok);
  const failed = results.filter((r): r is Extract<Result, { ok: false }> => !r.ok);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={step === "scanning" || step === "importing" ? undefined : onClose} />
      <div className="relative card w-full max-w-3xl max-h-[92vh] flex flex-col" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[15px] text-[var(--ink)]">Sync creator replies from Gmail</h2>
          <button onClick={onClose} disabled={step === "scanning" || step === "importing"} className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {step === "setup" && (
            <>
              <p className="text-sm text-[var(--muted)]">
                Finds creators you emailed straight from Gmail who have replied — with their rate, or whether they&apos;re interested — and
                adds them here. You review the list first. Nothing is sent, and no follow-ups are scheduled.
              </p>
              <div>
                <span className="block text-xs font-medium text-[var(--muted)] mb-1">Look back</span>
                <div className="flex gap-1.5">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className="px-3 py-1 rounded-full text-xs font-medium border"
                      style={days === d ? { background: "var(--brand-teal-dark)", color: "var(--surface)", borderColor: "var(--brand-teal-dark)" } : { borderColor: "var(--border)", color: "var(--muted)" }}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {(step === "scanning" || step === "importing") && (
            <div className="py-12 flex flex-col items-center gap-3 text-sm text-[var(--muted)]">
              <Loader2 size={22} className="animate-spin" />
              {step === "scanning" ? `Reading the last ${days} days of Gmail…` : `Adding creators… ${progress}/${picked.size}`}
            </div>
          )}

          {step === "review" &&
            (candidates.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">No untracked creator replies in the last {days} days — everything is already in the system.</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">
                    {candidates.length} conversation{candidates.length === 1 ? "" : "s"} found · {picked.size} selected
                  </span>
                  <button onClick={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.gmailThreadId)))} className="font-medium" style={{ color: "var(--brand-teal-dark)" }}>
                    {picked.size === candidates.length ? "Select none" : "Select all"}
                  </button>
                </div>
                {candidates.map((c) => {
                  const intent = INTENT[c.intent] ?? INTENT.HUMAN_REPLY;
                  const on = picked.has(c.gmailThreadId);
                  return (
                    <div key={c.gmailThreadId} className="rounded-xl border border-[var(--border)] p-3 space-y-2" style={{ opacity: on ? 1 : 0.6 }}>
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={on}
                          onChange={() =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.gmailThreadId)) next.delete(c.gmailThreadId);
                              else next.add(c.gmailThreadId);
                              return next;
                            })
                          }
                          aria-label={`Add ${c.contactName}`}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-[var(--ink)]">{c.contactName}</span>
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: intent.bg, color: intent.fg }}>
                              {intent.label}
                            </span>
                            {c.rates.length > 0 && <span className="text-xs font-semibold text-[var(--ink)]">{c.rates.map((r) => formatRate(r)).join(" · ")}</span>}
                          </div>
                          <div className="text-[11px] text-[var(--muted-2)] truncate">
                            {c.contactEmail} · “{c.subject}” · replied {day(c.lastReplyAt)}
                          </div>
                          <p className="text-xs text-[var(--muted)] line-clamp-2 whitespace-pre-line">{c.summary ?? c.replyText}</p>
                          {c.match ? (
                            <p className="text-[11px]" style={{ color: "var(--success-fg)" }}>
                              Already in your roster as {c.match.name} — this conversation gets linked to them.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                              <input
                                className="input py-1 text-xs"
                                value={names[c.gmailThreadId] ?? ""}
                                onChange={(e) => setNames((n) => ({ ...n, [c.gmailThreadId]: e.target.value }))}
                                placeholder="Creator / channel name"
                                aria-label={`Creator name for ${c.contactEmail}`}
                              />
                              <input
                                className="input py-1 text-xs"
                                value={channels[c.gmailThreadId] ?? ""}
                                onChange={(e) => setChannels((n) => ({ ...n, [c.gmailThreadId]: e.target.value }))}
                                placeholder="youtube.com/@handle (optional — fills in their stats)"
                                aria-label={`YouTube channel for ${c.contactEmail}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ))}

          {step === "done" && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--success-fg)" }}>
                <CheckCircle2 size={16} /> {added.length} creator conversation{added.length === 1 ? "" : "s"} added
              </p>
              {added.map((r) => {
                const c = byId.get(r.gmailThreadId);
                return (
                  <p key={r.gmailThreadId} className="text-xs text-[var(--ink)]">
                    {c?.match?.name ?? names[r.gmailThreadId] ?? c?.contactName} — {r.ok ? `${r.summary}${r.created ? " · new in roster" : ""}` : ""}
                  </p>
                );
              })}
              {failed.length > 0 && (
                <div className="rounded-lg p-3 space-y-1" style={{ background: "var(--warn-bg)" }}>
                  {failed.map((r) => (
                    <p key={r.gmailThreadId} className="text-xs" style={{ color: "var(--warn-fg)" }}>
                      {byId.get(r.gmailThreadId)?.contactName}: {r.error}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-xs text-[var(--muted)]">They now show on the Creators and Outreach tabs. New replies in these threads are picked up automatically.</p>
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[var(--border)]">
          {step === "setup" && (
            <>
              <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
                Cancel
              </button>
              <button onClick={() => void scan()} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                <MailSearch size={14} /> Scan Gmail
              </button>
            </>
          )}
          {step === "review" && (
            <>
              <button onClick={() => setStep("setup")} className="btn-secondary px-4 py-2 text-sm">
                Back
              </button>
              <button onClick={() => void importPicked()} disabled={picked.size === 0} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                Add {picked.size} to the system
              </button>
            </>
          )}
          {step === "done" && (
            <button onClick={onClose} className="btn-primary px-4 py-2 text-sm ml-auto">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
