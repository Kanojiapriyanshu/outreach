"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { renderTemplate } from "@/lib/templates";

export interface PitchCreator {
  id: string;
  name: string;
  email: string | null;
  thumbnailUrl: string | null;
  channelUrl: string | null;
}

interface Draft {
  creatorId: string;
  name: string;
  thumbnailUrl: string | null;
  channelUrl: string | null;
  to: string;
  include: boolean;
  error?: string;
  variables: Record<string, string>;
  subject: string;
  body: string;
  templateSubject: string;
  templateBody: string;
  /** The team edited the email text itself — variable edits stop re-rendering over it. */
  edited: boolean;
  topics: { phrase: string; videos: number }[];
  emailSource: string | null;
  open: boolean;
}

interface SendResult {
  creatorId: string;
  to: string;
  status: "scheduled" | "skipped" | "error";
  detail?: string;
}

const CAMPAIGN_KEY = "fidem_pitch_campaign";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PERSONALIZE_CHUNK = 10;
const SEND_CHUNK = 100;

function savedCampaign(): { brandCategory: string; deliverable: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) ?? "{}");
    return { brandCategory: String(saved.brandCategory ?? ""), deliverable: String(saved.deliverable ?? "") };
  } catch {
    return { brandCategory: "", deliverable: "" };
  }
}

function rerender(d: Draft): Draft {
  if (d.edited || !d.templateBody) return d;
  return { ...d, subject: renderTemplate(d.templateSubject, d.variables), body: renderTemplate(d.templateBody, d.variables) };
}

function emptyDraft(c: PitchCreator, error: string): Draft {
  return {
    creatorId: c.id,
    name: c.name,
    thumbnailUrl: c.thumbnailUrl,
    channelUrl: c.channelUrl,
    to: c.email ?? "",
    include: false,
    error,
    variables: {},
    subject: "",
    body: "",
    templateSubject: "",
    templateBody: "",
    edited: false,
    topics: [],
    emailSource: null,
    open: false,
  };
}

/**
 * Pitch one or many creators: set the campaign once, every Email 1 is filled in from that creator's
 * own channel, the team reviews and edits each one, and they're queued for the worker to send one at
 * a time. Nothing goes out from this dialog directly.
 */
export default function BulkPitchDialog({ creators, onClose, onDone }: { creators: PitchCreator[]; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"setup" | "writing" | "review" | "sending" | "done">("setup");
  const [brandCategory, setBrandCategory] = useState(() => savedCampaign().brandCategory);
  const [deliverable, setDeliverable] = useState(() => savedCampaign().deliverable);
  const [sendMode, setSendMode] = useState<"window" | "now">("window");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ items: SendResult[]; scheduledAt: string | null; fromEmail: string | null } | null>(null);

  const missingEmail = creators.filter((c) => !c.email).length;
  const ready = drafts.filter((d) => d.include && !d.error && EMAIL_RE.test(d.to.trim()));

  function updateDraft(id: string, change: (d: Draft) => Draft) {
    setDrafts((list) => list.map((d) => (d.creatorId === id ? change(d) : d)));
  }

  async function writeEmails() {
    setError(null);
    try {
      localStorage.setItem(CAMPAIGN_KEY, JSON.stringify({ brandCategory, deliverable }));
    } catch {
      // Remembering the campaign is a convenience only.
    }
    setStep("writing");
    setProgress(0);
    const byId = new Map(creators.map((c) => [c.id, c]));
    const written: Draft[] = [];

    for (let i = 0; i < creators.length; i += PERSONALIZE_CHUNK) {
      const chunk = creators.slice(i, i + PERSONALIZE_CHUNK);
      try {
        const res = await fetch("/api/influencers/personalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorIds: chunk.map((c) => c.id), campaign: { brandCategory, deliverable } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't write the emails");
        for (const d of data.drafts) {
          const c = byId.get(d.creatorId);
          if (!c) continue;
          written.push({
            creatorId: c.id,
            name: d.name || c.name,
            thumbnailUrl: d.thumbnailUrl ?? c.thumbnailUrl,
            channelUrl: d.channelUrl ?? c.channelUrl,
            to: d.email ?? c.email ?? "",
            include: true,
            variables: d.variables,
            subject: d.subject,
            body: d.body,
            templateSubject: d.templateSubject,
            templateBody: d.templateBody,
            edited: false,
            topics: d.topics,
            emailSource: d.emailSource,
            open: false,
          });
        }
        for (const e of data.errors as { creatorId: string; error: string }[]) {
          const c = byId.get(e.creatorId);
          if (c) written.push(emptyDraft(c, e.error));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't write this email";
        chunk.forEach((c) => written.push(emptyDraft(c, message)));
      }
      setProgress(Math.min(creators.length, i + PERSONALIZE_CHUNK));
    }

    const order = new Map(creators.map((c, i) => [c.id, i]));
    written.sort((a, b) => (order.get(a.creatorId) ?? 0) - (order.get(b.creatorId) ?? 0));
    setDrafts(written);
    setStep("review");
  }

  function applyCampaignToAll() {
    setDrafts((list) =>
      list.map((d) =>
        d.error
          ? d
          : rerender({
              ...d,
              variables: {
                ...d.variables,
                ...(brandCategory.trim() ? { Niche_Or_Product_Category: brandCategory.trim() } : {}),
                ...(deliverable.trim() ? { Deliverable_Type: deliverable.trim() } : {}),
              },
            })
      )
    );
  }

  async function queueEmails() {
    if (ready.length === 0) return;
    const withTags = ready.filter((d) => /\{[A-Za-z_]+\}/.test(`${d.subject} ${d.body}`)).length;
    if (withTags > 0 && !confirm(`${withTags} email${withTags === 1 ? " still contains" : "s still contain"} a {Tag} that will be sent as literal text. Queue anyway?`)) {
      return;
    }
    setError(null);
    setStep("sending");
    const items: SendResult[] = [];
    let scheduledAt: string | null = null;
    let fromEmail: string | null = null;
    try {
      for (let i = 0; i < ready.length; i += SEND_CHUNK) {
        const res = await fetch("/api/influencers/bulk-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sendMode,
            items: ready.slice(i, i + SEND_CHUNK).map((d) => ({ creatorId: d.creatorId, to: d.to.trim(), subject: d.subject, body: d.body, variables: d.variables })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't queue the emails");
        items.push(...data.results);
        scheduledAt = data.scheduledAt;
        fromEmail = data.fromEmail;
      }
      setResults({ items, scheduledAt, fromEmail });
      setStep("done");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't queue the emails");
      setStep("review");
    }
  }

  const scheduledCount = results?.items.filter((r) => r.status === "scheduled").length ?? 0;
  const problems = results?.items.filter((r) => r.status !== "scheduled") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={step === "writing" || step === "sending" ? undefined : onClose} />
      <div className="relative card w-full max-w-3xl max-h-[92vh] flex flex-col shadow-xl" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[15px] text-[var(--ink)]">
            Pitch {creators.length} creator{creators.length === 1 ? "" : "s"}
          </h2>
          <button onClick={onClose} disabled={step === "writing" || step === "sending"} className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === "setup" && (
            <>
              <p className="text-sm text-[var(--muted)]">
                Each Email 1 is filled in from that creator&apos;s own recent uploads. Set this campaign&apos;s details once — you&apos;ll
                review and can edit every email before anything is queued.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Brand's category" hint="Leave blank to use each creator's own niche">
                  <input className="input" value={brandCategory} onChange={(e) => setBrandCategory(e.target.value)} placeholder="home furniture/living" maxLength={120} />
                </Field>
                <Field label="Type of video" hint={'Leave blank for "dedicated review"'}>
                  <input className="input" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="dedicated sofa review" maxLength={120} />
                </Field>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-[var(--muted)] mb-1">When should they go out?</legend>
                <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                  <input type="radio" checked={sendMode === "window"} onChange={() => setSendMode("window")} /> During the sending window (recommended)
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                  <input type="radio" checked={sendMode === "now"} onChange={() => setSendMode("now")} /> As soon as possible
                </label>
                <p className="text-xs text-[var(--muted-2)]">Either way they send one at a time, a few minutes apart, within your daily limit — never as a burst.</p>
              </fieldset>
              {missingEmail > 0 && (
                <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
                  {missingEmail} of these {missingEmail === 1 ? "has" : "have"} no email yet — you can paste one in on the next step, or leave them out.
                </p>
              )}
            </>
          )}

          {step === "writing" && (
            <div className="py-12 flex flex-col items-center gap-3 text-sm text-[var(--muted)]">
              <Loader2 size={22} className="animate-spin" />
              Reading their channels and writing the emails… {progress}/{creators.length}
            </div>
          )}

          {step === "review" && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 rounded-lg p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <Field label="Brand's category">
                  <input className="input" value={brandCategory} onChange={(e) => setBrandCategory(e.target.value)} maxLength={120} />
                </Field>
                <Field label="Type of video">
                  <input className="input" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} maxLength={120} />
                </Field>
                <button onClick={applyCampaignToAll} className="btn-secondary px-3 py-2 text-xs whitespace-nowrap">
                  Apply to all
                </button>
              </div>

              {drafts.map((d) => {
                const validEmail = EMAIL_RE.test(d.to.trim());
                return (
                  <div key={d.creatorId} className="rounded-xl border border-[var(--border)] p-3.5 space-y-3" style={{ opacity: d.include || d.error ? 1 : 0.6 }}>
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-1.5"
                        checked={d.include}
                        disabled={!!d.error}
                        onChange={() => updateDraft(d.creatorId, (x) => ({ ...x, include: !x.include }))}
                        aria-label={`Include ${d.name}`}
                      />
                      {d.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- remote YouTube avatar
                        <img src={d.thumbnailUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="font-medium text-sm text-[var(--ink)] truncate">{d.name}</div>
                        {d.error ? (
                          <p className="text-xs flex items-center gap-1" style={{ color: "var(--danger-fg)" }}>
                            <AlertTriangle size={12} /> {d.error}
                          </p>
                        ) : (
                          <>
                            <input
                              className="input py-1.5 text-sm"
                              value={d.to}
                              placeholder="Their email address"
                              onChange={(e) => updateDraft(d.creatorId, (x) => ({ ...x, to: e.target.value }))}
                              style={!validEmail ? { borderColor: "var(--danger-fg)" } : undefined}
                            />
                            <p className="text-[11px] text-[var(--muted-2)]">
                              {validEmail ? (
                                d.emailSource ? `Email from ${d.emailSource}` : "Email entered here"
                              ) : (
                                <>
                                  No email yet — paste it in
                                  {d.channelUrl && (
                                    <>
                                      {" "}from their{" "}
                                      <a href={`${d.channelUrl.replace(/\/+$/, "")}/about`} target="_blank" rel="noopener noreferrer" className="underline">
                                        About page
                                      </a>
                                    </>
                                  )}
                                  , or untick to leave them out.
                                </>
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {!d.error && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="sm:col-span-2">
                            <Field label="What stands out in their content">
                              <input
                                className="input py-1.5 text-sm"
                                value={d.variables.Content_Highlights ?? ""}
                                onChange={(e) => updateDraft(d.creatorId, (x) => rerender({ ...x, variables: { ...x.variables, Content_Highlights: e.target.value } }))}
                              />
                            </Field>
                            <p className="text-[11px] text-[var(--muted-2)] mt-1 flex items-center gap-1">
                              <Sparkles size={11} />
                              {d.topics.length > 0
                                ? `From their recent uploads: ${d.topics.map((t) => `${t.phrase} (${t.videos} video${t.videos === 1 ? "" : "s"})`).join(", ")}`
                                : "Reused from their profile, or no clear recurring topic — worth a quick check."}
                            </p>
                          </div>
                          <Field label="Brand's category">
                            <input
                              className="input py-1.5 text-sm"
                              value={d.variables.Niche_Or_Product_Category ?? ""}
                              onChange={(e) => updateDraft(d.creatorId, (x) => rerender({ ...x, variables: { ...x.variables, Niche_Or_Product_Category: e.target.value } }))}
                            />
                          </Field>
                          <Field label="Type of video">
                            <input
                              className="input py-1.5 text-sm"
                              value={d.variables.Deliverable_Type ?? ""}
                              onChange={(e) => updateDraft(d.creatorId, (x) => rerender({ ...x, variables: { ...x.variables, Deliverable_Type: e.target.value } }))}
                            />
                          </Field>
                        </div>

                        <button
                          onClick={() => updateDraft(d.creatorId, (x) => ({ ...x, open: !x.open }))}
                          className="inline-flex items-center gap-1 text-xs font-medium"
                          style={{ color: "var(--brand-teal-dark)" }}
                        >
                          {d.open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {d.open ? "Hide email" : "Preview & edit the email"}
                        </button>
                        {d.open && (
                          <div className="space-y-2">
                            <input
                              className="input py-1.5 text-sm font-medium"
                              value={d.subject}
                              onChange={(e) => updateDraft(d.creatorId, (x) => ({ ...x, subject: e.target.value, edited: true }))}
                            />
                            <textarea
                              className="input font-sans text-sm leading-relaxed"
                              style={{ minHeight: 240, resize: "vertical" }}
                              value={d.body}
                              onChange={(e) => updateDraft(d.creatorId, (x) => ({ ...x, body: e.target.value, edited: true }))}
                            />
                            {d.edited && (
                              <button
                                onClick={() => updateDraft(d.creatorId, (x) => rerender({ ...x, edited: false }))}
                                className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                              >
                                <RotateCcw size={12} /> Undo my edits to this email
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {step === "sending" && (
            <div className="py-12 flex flex-col items-center gap-3 text-sm text-[var(--muted)]">
              <Loader2 size={22} className="animate-spin" />
              Queuing {ready.length} email{ready.length === 1 ? "" : "s"}…
            </div>
          )}

          {step === "done" && results && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--success-fg)" }}>
                <CheckCircle2 size={16} /> {scheduledCount} email{scheduledCount === 1 ? "" : "s"} queued
                {results.fromEmail ? ` from ${results.fromEmail}` : ""}.
              </p>
              <p className="text-sm text-[var(--muted)]">
                They send one at a time
                {results.scheduledAt ? ` starting ${new Date(results.scheduledAt).toLocaleString()}` : ""}, then follow up automatically.
                Track them on the Outreach tab and the Scheduled page.
              </p>
              {problems.length > 0 && (
                <div className="rounded-lg p-3 space-y-1.5" style={{ background: "var(--warn-bg)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--warn-fg)" }}>
                    {problems.length} not queued
                  </p>
                  {problems.map((p) => (
                    <p key={`${p.creatorId}-${p.to}`} className="text-xs" style={{ color: "var(--warn-fg)" }}>
                      {drafts.find((d) => d.creatorId === p.creatorId)?.name ?? p.to}: {p.detail}
                    </p>
                  ))}
                </div>
              )}
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
              <button onClick={() => void writeEmails()} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                <Sparkles size={14} /> Write the emails
              </button>
            </>
          )}
          {step === "review" && (
            <>
              <button onClick={() => setStep("setup")} className="btn-secondary px-4 py-2 text-sm">
                Back
              </button>
              <button onClick={() => void queueEmails()} disabled={ready.length === 0} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">
                Queue {ready.length} email{ready.length === 1 ? "" : "s"}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1">
      <span className="block text-xs font-medium text-[var(--muted)] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--muted-2)] mt-1">{hint}</span>}
    </label>
  );
}
