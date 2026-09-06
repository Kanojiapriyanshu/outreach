"use client";

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { variableLabel, variableHint, BUDGET_TYPE_OPTIONS, budgetTypeLabel } from "@/lib/friendlyLabels";

export interface BrandDetails {
  contactName: string;
  brandName: string;
  /** The CLIENT brand/product/campaign name referenced inside the email — only shown/used for
   * Agency mode, where brandName is the agency itself, not the thing being pitched. */
  campaignName: string;
  website: string;
  category: string;
  budgetRangeText: string;
  budgetType: "FLAT_FEE" | "COMMISSION" | "PRODUCT_ONLY" | "HYBRID" | "UNKNOWN";
  influencerRangeMin: string;
  influencerRangeMax: string;
  deliverables: string;
  campaignTimeline: string;
}

export const EMPTY_BRAND_DETAILS: BrandDetails = {
  contactName: "",
  brandName: "",
  campaignName: "",
  website: "",
  category: "",
  budgetRangeText: "",
  budgetType: "UNKNOWN",
  influencerRangeMin: "",
  influencerRangeMax: "",
  deliverables: "",
  campaignTimeline: "",
};

export default function BrandDetailsForm({
  recipientType,
  onRecipientTypeChange,
  contactEmail,
  onContactEmailChange,
  details,
  onDetailsChange,
  variables,
  onVariablesChange,
}: {
  recipientType: "DIRECT" | "AGENCY";
  onRecipientTypeChange: (v: "DIRECT" | "AGENCY") => void;
  contactEmail: string;
  onContactEmailChange: (v: string) => void;
  details: BrandDetails;
  onDetailsChange: (d: BrandDetails) => void;
  variables: Record<string, string>;
  onVariablesChange: (v: Record<string, string>) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [emailText, setEmailText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  function set<K extends keyof BrandDetails>(key: K, value: BrandDetails[K]) {
    onDetailsChange({ ...details, [key]: value });
  }
  function setVar(key: string, value: string) {
    onVariablesChange({ ...variables, [key]: value });
  }

  async function extract() {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/extract/email-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that email — try filling in the details below yourself.");
      const d = data.details;
      // Every field below is one this extractor actually tries to detect from an email, so a
      // fresh paste REPLACES them outright (falling back to blank, not the old value) — otherwise
      // a field this new email doesn't mention silently keeps whatever a *previous*, unrelated
      // paste left behind (e.g. "voice changer earbuds" surviving into an email about a totally
      // different product). Fields we never try to extract (website) are left untouched.
      onDetailsChange({
        ...details,
        contactName: d.contactName ?? "",
        brandName: d.brandOrAgencyName ?? "",
        campaignName: d.campaignOrProductName ?? "",
        category: d.category ?? "",
        budgetRangeText: d.budgetRangeText ?? "",
        budgetType: d.budgetType ?? "UNKNOWN",
        influencerRangeMin: d.influencerRangeMin != null ? String(d.influencerRangeMin) : "",
        influencerRangeMax: d.influencerRangeMax != null ? String(d.influencerRangeMax) : "",
        deliverables: d.deliverables ?? "",
        campaignTimeline: d.campaignTimeline ?? "",
      });
      onVariablesChange({
        ...variables,
        Niche_Categories: d.nicheCategories ?? "",
        Key_Product_Features: d.keyProductFeatures ?? "",
        Target_Audience_Or_Angle: d.targetAudienceOrAngle ?? "",
      });
      onContactEmailChange(d.contactEmail ?? "");
      onRecipientTypeChange(d.isAgency ? "AGENCY" : "DIRECT");
      if (d.budgetRangeText || d.deliverables || d.campaignTimeline) setMoreOpen(true);
      setPasteOpen(false);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Couldn't read that email — try filling in the details below yourself.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-[var(--ink)]">Who are you emailing?</label>
          <button
            type="button"
            onClick={() => setPasteOpen(!pasteOpen)}
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: "var(--brand-teal-dark)" }}
          >
            <Sparkles size={13} /> {pasteOpen ? "Hide" : "Got their email already? Paste it to fill this in"}
          </button>
        </div>
        <div className="flex gap-2">
          <RecipientButton
            label="A brand, directly"
            active={recipientType === "DIRECT"}
            onClick={() => onRecipientTypeChange("DIRECT")}
          />
          <RecipientButton
            label="An agency (working on a brand's behalf)"
            active={recipientType === "AGENCY"}
            onClick={() => onRecipientTypeChange("AGENCY")}
          />
        </div>
      </div>

      {pasteOpen && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <p className="text-xs text-[var(--muted)]">
            Paste the email they sent you and this will try to fill in their name, what they are selling, budget,
            and channel-size ask automatically. Anything it cannot find, just fill in below.
          </p>
          <textarea
            className="input font-mono text-[12px]"
            rows={8}
            placeholder="Paste the email text here…"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
          />
          <button
            onClick={extract}
            disabled={extracting || !emailText.trim()}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Sparkles size={13} /> {extracting ? "Reading…" : "Fill In From This Email"}
          </button>
          {extractError && <p className="text-xs" style={{ color: "var(--danger-fg)" }}>{extractError}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Their email address" value={contactEmail} onChange={onContactEmailChange} />
        <Field label="Their name" value={details.contactName} onChange={(v) => set("contactName", v)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field
          label={recipientType === "AGENCY" ? "Agency's name" : "Brand or campaign name"}
          value={details.brandName}
          onChange={(v) => set("brandName", v)}
        />
        <Field label="Website (optional)" value={details.website} onChange={(v) => set("website", v)} />
        <Field label="What they sell" hint="e.g. wireless earbuds" value={details.category} onChange={(v) => set("category", v)} />
      </div>

      {recipientType === "AGENCY" && (
        <div className="rounded-lg p-3" style={{ background: "var(--brand-teal-light)" }}>
          <Field
            label="The actual brand's name — what to call it in the email"
            hint="Not the agency's own name — the client they're representing"
            value={details.campaignName}
            onChange={(v) => set("campaignName", v)}
          />
        </div>
      )}

      <div className={recipientType === "DIRECT" ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
        <Field
          label={variableLabel("Niche_Categories")}
          hint={variableHint("Niche_Categories")}
          value={variables.Niche_Categories ?? ""}
          onChange={(v) => setVar("Niche_Categories", v)}
        />
        <Field
          label={variableLabel("Key_Product_Features")}
          hint={variableHint("Key_Product_Features")}
          value={variables.Key_Product_Features ?? ""}
          onChange={(v) => setVar("Key_Product_Features", v)}
        />
        {/* The Agency template pitches the product on its own merits rather than an
            audience-comparison angle, so it never references this — no point asking for it. */}
        {recipientType === "DIRECT" && (
          <Field
            label={variableLabel("Target_Audience_Or_Angle")}
            hint={variableHint("Target_Audience_Or_Angle")}
            value={variables.Target_Audience_Or_Angle ?? ""}
            onChange={(v) => setVar("Target_Audience_Or_Angle", v)}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setMoreOpen(!moreOpen)}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <ChevronDown size={14} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        More details (budget, channel size, timeline) — optional
      </button>

      {moreOpen && (
        <div className="space-y-3 rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget or rate" hint="e.g. $500-$1000" value={details.budgetRangeText} onChange={(v) => set("budgetRangeText", v)} />
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">How they pay</label>
              <select
                className="input"
                value={details.budgetType}
                onChange={(e) => set("budgetType", e.target.value as BrandDetails["budgetType"])}
              >
                {BUDGET_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {budgetTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Smallest channel size (subscribers)"
              value={details.influencerRangeMin}
              onChange={(v) => set("influencerRangeMin", v)}
            />
            <Field
              label="Largest channel size (subscribers)"
              value={details.influencerRangeMax}
              onChange={(v) => set("influencerRangeMax", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="What they want made" hint="e.g. one dedicated review video" value={details.deliverables} onChange={(v) => set("deliverables", v)} />
            <Field label="When the campaign runs" value={details.campaignTimeline} onChange={(v) => set("campaignTimeline", v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function RecipientButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "btn-primary px-3 py-1.5 text-xs" : "btn-secondary px-3 py-1.5 text-xs"}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
        {label}
        {hint ? <span className="text-[var(--muted-2)] font-normal"> — {hint}</span> : null}
      </label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
