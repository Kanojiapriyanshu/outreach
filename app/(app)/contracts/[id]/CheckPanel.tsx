"use client";

import { useState } from "react";
import { AlertOctagon, AlertTriangle, Check, Copy, Lightbulb, Loader2, Sparkles, Wand2 } from "lucide-react";
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { formatContractDate, type ContractFields } from "@/lib/contracts/template";
import type { DealSummary, Finding, QuickFix, Severity } from "@/lib/contracts/analyze";

interface AiReview {
  verdict: "ready_to_send" | "send_after_fixes" | "needs_rework";
  summary: string;
  issues: { severity: Severity; clause: string; issue: string; suggestion: string }[];
}

const SEVERITY: Record<Severity, { label: string; icon: typeof AlertOctagon; bg: string; fg: string }> = {
  blocker: { label: "Fix before sending", icon: AlertOctagon, bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
  risk: { label: "Risks to decide on", icon: AlertTriangle, bg: "var(--warn-bg)", fg: "var(--warn-fg)" },
  tip: { label: "Worth tightening", icon: Lightbulb, bg: "var(--info-bg)", fg: "var(--info-fg)" },
};

const VERDICT: Record<AiReview["verdict"], string> = {
  ready_to_send: "Ready to send",
  send_after_fixes: "Send after a few fixes",
  needs_rework: "Needs rework",
};

/** The deal check: money first, then what to fix, with one-click fixes and an optional AI review. */
export default function CheckPanel({
  fields,
  findings,
  deal,
  aiAvailable,
  onFix,
  onGoTo,
  saveNow,
  contractId,
}: {
  fields: ContractFields;
  findings: Finding[];
  deal: DealSummary;
  aiAvailable: boolean;
  onFix: (fix: QuickFix) => void;
  onGoTo: (finding: Finding) => void;
  saveNow: () => Promise<boolean>;
  contractId: string;
}) {
  const [ai, setAi] = useState<AiReview | null>(null);
  const [aiState, setAiState] = useState<"idle" | "running" | "error">("idle");
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, deal.currency));

  async function runAi() {
    setAiState("running");
    setAiError("");
    try {
      if (!(await saveNow())) throw new Error("Couldn't save the latest changes first — try again.");
      const res = await fetch(`/api/contracts/${contractId}/review`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI review failed");
      setAi(data.review);
      setAiState("idle");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI review failed");
      setAiState("error");
    }
  }

  const counts = { blocker: 0, risk: 0, tip: 0 };
  findings.forEach((f) => counts[f.severity]++);

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-[var(--muted)]">Deal</span>
          <span className="text-lg font-semibold text-[var(--ink)]">{money(deal.fee)}</span>
        </div>
        <Row label={`Upfront (${fields.depositPercent}%)`} value={`${money(deal.deposit)}${deal.depositDueBy ? ` · due ${formatContractDate(deal.depositDueBy)}` : ` · ${fields.depositBusinessDays} business days after signing`}`} />
        <Row label="Before go-live" value={money(deal.balance)} />
        {deal.margin !== null ? (
          <Row label="Your margin" value={`${money(deal.margin)} (${deal.marginPercent!.toFixed(0)}%)`} tone={deal.margin < 0 ? "bad" : deal.marginPercent! < 15 ? "warn" : "good"} />
        ) : (
          <Row label="Your margin" value="Add the creator cost under Money" />
        )}
        {deal.depositCoversCreator !== null && (
          <Row label="Deposit covers creator" value={`${Math.round(deal.depositCoversCreator * 100)}%`} tone={deal.depositCoversCreator >= 1 ? "good" : "warn"} />
        )}
        <Row label="Script / draft due" value={`${deal.scriptDueDays} / ${deal.draftDueDays} days after delivery`} />
        {deal.nonCircumventionUntil && <Row label="Non-circumvention at least until" value={formatContractDate(deal.nonCircumventionUntil)} />}
      </div>

      {findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2.5" style={{ background: "var(--success-bg)", color: "var(--success-fg)" }}>
          <Check size={15} /> Nothing to fix — this is ready for the brand.
        </p>
      ) : (
        (["blocker", "risk", "tip"] as Severity[]).map((sev) =>
          counts[sev] === 0 ? null : (
            <div key={sev} className="space-y-1.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: SEVERITY[sev].fg }}>
                {SEVERITY[sev].label} · {counts[sev]}
              </h4>
              {findings
                .filter((f) => f.severity === sev)
                .map((f) => {
                  const Icon = SEVERITY[sev].icon;
                  return (
                    <div key={f.id} className="rounded-lg p-2.5 space-y-1.5" style={{ background: SEVERITY[sev].bg }}>
                      <div className="flex items-start gap-2">
                        <Icon size={14} className="mt-0.5 shrink-0" style={{ color: SEVERITY[sev].fg }} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold" style={{ color: SEVERITY[sev].fg }}>
                            {f.title}
                          </div>
                          <p className="text-xs leading-relaxed text-[var(--ink)] opacity-85">{f.detail}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 pl-6">
                        {f.fix && (
                          <button type="button" onClick={() => onFix(f.fix!)} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--brand-teal-dark)" }}>
                            <Wand2 size={11} /> {f.fix.label}
                          </button>
                        )}
                        {(f.field || f.sectionId) && (
                          <button type="button" onClick={() => onGoTo(f)} className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]">
                            {f.field ? "Edit" : "Show"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )
        )
      )}

      <div className="rounded-xl border border-[var(--border)] p-3.5 space-y-2.5" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-[13px] font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Sparkles size={13} /> AI legal review
            </h4>
            <p className="text-[11px] text-[var(--muted-2)]">Reads the whole agreement — especially clauses you edited — for gaps, one-sided terms and inconsistencies.</p>
          </div>
          <button
            type="button"
            onClick={() => void runAi()}
            disabled={!aiAvailable || aiState === "running"}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap disabled:opacity-40"
            title={aiAvailable ? undefined : "Needs ANTHROPIC_API_KEY on the server"}
          >
            {aiState === "running" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {ai ? "Review again" : "Review"}
          </button>
        </div>
        {aiState === "running" && <p className="text-xs text-[var(--muted)]">Reading the agreement… this takes about a minute.</p>}
        {aiState === "error" && (
          <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
            {aiError}
          </p>
        )}
        {ai && aiState !== "running" && (
          <div className="space-y-2">
            <div className="text-xs">
              <span className="font-semibold" style={{ color: ai.verdict === "ready_to_send" ? "var(--success-fg)" : ai.verdict === "needs_rework" ? "var(--danger-fg)" : "var(--warn-fg)" }}>
                {VERDICT[ai.verdict]}.
              </span>{" "}
              <span className="text-[var(--ink)]">{ai.summary}</span>
            </div>
            {ai.issues.map((issue, i) => (
              <div key={i} className="rounded-lg p-2.5 text-xs space-y-1" style={{ background: SEVERITY[issue.severity].bg }}>
                <div className="font-semibold" style={{ color: SEVERITY[issue.severity].fg }}>
                  {issue.clause ? `${issue.clause} — ` : ""}
                  {issue.issue}
                </div>
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[var(--ink)] leading-relaxed">{issue.suggestion}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(issue.suggestion).catch(() => undefined);
                      setCopied(i);
                      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
                    }}
                    className="shrink-0 p-1 rounded text-[var(--muted)] hover:text-[var(--ink)]"
                    title="Copy the suggested wording"
                  >
                    {copied === i ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-[var(--muted-2)]">AI review is a second pair of eyes, not legal advice.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "var(--success-fg)" : tone === "warn" ? "var(--warn-fg)" : tone === "bad" ? "var(--danger-fg)" : "var(--ink)";
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium text-right" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
