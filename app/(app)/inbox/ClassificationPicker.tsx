"use client";

import { useState } from "react";
import { Tag, ChevronDown, Check, Sparkles } from "lucide-react";
import type { OutboundGuess } from "@/lib/outboundClassifier";

/** What the compose window will actually act on — either the auto-detected guess or a manual
 * override, collapsed to just the fields that matter for sending (no `reason`/`source`, those are
 * only for explaining the auto-guess in the UI). */
export type ClassificationChoice =
  | { outreachType: "CREATOR" }
  | { outreachType: "BRAND"; recipientType: "DIRECT" | "AGENCY" }
  | { outreachType: null };

export function effectiveClassification(guess: OutboundGuess | null, override: ClassificationChoice | null): ClassificationChoice {
  if (override) return override;
  if (guess?.outreachType === "CREATOR") return { outreachType: "CREATOR" };
  if (guess?.outreachType === "BRAND") return { outreachType: "BRAND", recipientType: guess.recipientType };
  return { outreachType: null };
}

function labelFor(c: ClassificationChoice): string {
  if (c.outreachType === "CREATOR") return "Creator outreach";
  if (c.outreachType === "BRAND") return c.recipientType === "AGENCY" ? "Agency outreach" : "Brand outreach";
  return "Just an email";
}

const OPTIONS: ClassificationChoice[] = [
  { outreachType: "CREATOR" },
  { outreachType: "BRAND", recipientType: "DIRECT" },
  { outreachType: "BRAND", recipientType: "AGENCY" },
  { outreachType: null },
];

function sameChoice(a: ClassificationChoice, b: ClassificationChoice): boolean {
  if (a.outreachType !== b.outreachType) return false;
  if (a.outreachType === "BRAND" && b.outreachType === "BRAND") return a.recipientType === b.recipientType;
  return true;
}

/**
 * Shows what the CRM thinks this brand-new email is — brand, agency, creator, or just a plain
 * email with no automated follow-up — and lets the team override it in one click. This is what
 * decides whether sending creates a tracked OutreachSequence (and on which template/cadence) or
 * just goes out as mail; see lib/outboundClassifier.ts for how the guess itself is made.
 *
 * Only appears once there's a recipient to classify — before that there's nothing to guess from,
 * and showing "Just an email" by default would look like a decision that was already made.
 */
export default function ClassificationPicker({
  guess,
  override,
  onOverride,
  contactName,
  onContactNameChange,
  companyName,
  onCompanyNameChange,
}: {
  guess: OutboundGuess | null;
  override: ClassificationChoice | null;
  onOverride: (c: ClassificationChoice | null) => void;
  contactName: string;
  onContactNameChange: (v: string) => void;
  companyName: string;
  onCompanyNameChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const effective = effectiveClassification(guess, override);
  const isAuto = !override;

  return (
    <div className="py-2 border-b border-[var(--border)] space-y-2">
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[12px] font-medium border border-[var(--border)] hover:bg-[var(--bg)] transition-colors"
          style={effective.outreachType ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)", borderColor: "transparent" } : undefined}
        >
          {isAuto ? <Sparkles size={11} /> : <Tag size={11} />}
          {isAuto ? "This looks like: " : ""}
          {labelFor(effective)}
          <ChevronDown size={12} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div
              className="absolute left-0 top-full mt-1 z-20 w-56 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onOverride(opt);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-[var(--bg)] text-[var(--ink)]"
                >
                  {labelFor(opt)}
                  {sameChoice(opt, effective) && !isAuto && <Check size={13} />}
                </button>
              ))}
              {!isAuto && (
                <button
                  type="button"
                  onClick={() => {
                    onOverride(null);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-left hover:bg-[var(--bg)] border-t border-[var(--border)] mt-1 pt-2 text-[var(--muted)]"
                >
                  <Sparkles size={12} /> Let the CRM decide
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {isAuto && guess?.reason && <p className="text-[11px] text-[var(--muted-2)] pl-0.5">{guess.reason}</p>}

      {effective.outreachType && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <input
            value={contactName}
            onChange={(e) => onContactNameChange(e.target.value)}
            placeholder="Their name"
            className="input py-1.5 text-[13px]"
          />
          {effective.outreachType === "BRAND" && (
            <input
              value={companyName}
              onChange={(e) => onCompanyNameChange(e.target.value)}
              placeholder={effective.recipientType === "AGENCY" ? "Agency name" : "Brand or company name"}
              className="input py-1.5 text-[13px]"
            />
          )}
        </div>
      )}
    </div>
  );
}
