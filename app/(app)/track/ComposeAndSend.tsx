"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { CREATOR_VARIABLES, renderTemplate } from "@/lib/templates";
import { variableLabel } from "@/lib/friendlyLabels";
import BrandDetailsForm, { EMPTY_BRAND_DETAILS, type BrandDetails } from "./BrandDetailsForm";

interface ConnectedAccount {
  id: string;
  email: string;
  accessStatus: string;
}

interface TemplateRow {
  outreachType: "BRAND" | "CREATOR";
  recipientType: "DIRECT" | "AGENCY";
  step: number;
  subject: string;
  body: string;
}

export default function ComposeAndSend({
  outreachType,
  connectedAccounts,
}: {
  outreachType: "BRAND" | "CREATOR";
  connectedAccounts: ConnectedAccount[];
}) {
  const router = useRouter();
  const [emailAccountIdOverride, setEmailAccountIdOverride] = useState<string | null>(null);
  const emailAccountId = emailAccountIdOverride ?? connectedAccounts[0]?.id ?? "";
  const [contactEmail, setContactEmail] = useState("");
  const [recipientType, setRecipientType] = useState<"DIRECT" | "AGENCY">("DIRECT");
  const [brandDetails, setBrandDetails] = useState<BrandDetails>(EMPTY_BRAND_DETAILS);
  const [creatorName, setCreatorName] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/templates?type=${outreachType}`);
      const data = await res.json();
      setTemplates(data.templates);
    })();
  }, [outreachType]);

  const template =
    outreachType === "BRAND"
      ? templates.find((t) => t.step === 1 && t.recipientType === recipientType)
      : templates.find((t) => t.step === 1);

  const previewVars: Record<string, string> =
    outreachType === "BRAND"
      ? {
          Contact_Name: brandDetails.contactName || "{Contact_Name}",
          Brand_Or_Campaign_Name:
            (recipientType === "AGENCY" ? brandDetails.campaignName : brandDetails.brandName) ||
            "{Brand_Or_Campaign_Name}",
          Niche_Categories: variables.Niche_Categories ?? "{Niche_Categories}",
          Key_Product_Features: variables.Key_Product_Features ?? "{Key_Product_Features}",
          Target_Audience_Or_Angle: variables.Target_Audience_Or_Angle ?? "{Target_Audience_Or_Angle}",
        }
      : { ...variables, Contact_Name: creatorName || "{Contact_Name}" };
  const previewSubject = template ? renderTemplate(template.subject, previewVars) : "";
  const previewBody = template ? renderTemplate(template.body, previewVars) : "";

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/sequences/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outreachType,
          recipientType: outreachType === "BRAND" ? recipientType : undefined,
          emailAccountId,
          contactEmail,
          contactName: outreachType === "BRAND" ? brandDetails.contactName : creatorName,
          brand:
            outreachType === "BRAND"
              ? {
                  name: brandDetails.brandName,
                  campaignName: recipientType === "AGENCY" ? brandDetails.campaignName : undefined,
                  website: brandDetails.website,
                  category: brandDetails.category,
                  budgetRangeText: brandDetails.budgetRangeText,
                  budgetType: brandDetails.budgetType,
                  influencerRangeMin: brandDetails.influencerRangeMin ? Number(brandDetails.influencerRangeMin) : undefined,
                  influencerRangeMax: brandDetails.influencerRangeMax ? Number(brandDetails.influencerRangeMax) : undefined,
                  deliverables: brandDetails.deliverables,
                  campaignTimeline: brandDetails.campaignTimeline,
                }
              : undefined,
          creator:
            outreachType === "CREATOR"
              ? { name: creatorName, channelName, channelUrl, niche: variables.Niche_Or_Product_Category }
              : undefined,
          variables:
            outreachType === "BRAND"
              ? {
                  Niche_Categories: variables.Niche_Categories,
                  Key_Product_Features: variables.Key_Product_Features,
                  Target_Audience_Or_Angle: variables.Target_Audience_Or_Angle,
                }
              : variables,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      router.push(`/dashboard/${data.sequence.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const contactName = outreachType === "BRAND" ? brandDetails.contactName : creatorName;
  const canSend =
    !sending && !!contactEmail && !!contactName && !!template && connectedAccounts.length > 0;

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-[var(--ink)]">
          Write & Send the First Email ({outreachType === "BRAND" ? "Brand" : "Creator"})
        </h2>
        <p className="text-xs text-[var(--muted)]">
          This sends right away from your own Gmail — exactly as if you had typed and hit Send yourself. The
          automatic follow-up reminders kick in right after.
        </p>

        {connectedAccounts.length === 0 && (
          <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
            You have not connected a Gmail account yet — do that in Settings first.
          </p>
        )}
        {connectedAccounts.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Send from which inbox?</label>
            <select className="input" value={emailAccountId} onChange={(e) => setEmailAccountIdOverride(e.target.value)}>
              {connectedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {outreachType === "BRAND" ? (
          <BrandDetailsForm
            recipientType={recipientType}
            onRecipientTypeChange={setRecipientType}
            contactEmail={contactEmail}
            onContactEmailChange={setContactEmail}
            details={brandDetails}
            onDetailsChange={setBrandDetails}
            variables={variables}
            onVariablesChange={setVariables}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Their email address" value={contactEmail} onChange={setContactEmail} />
              <TextField label="Their name" value={creatorName} onChange={setCreatorName} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Channel name (optional)" value={channelName} onChange={setChannelName} />
              <TextField label="Channel link (optional)" value={channelUrl} onChange={setChannelUrl} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CREATOR_VARIABLES.filter((k) => k !== "Creator_Name").map((key) => (
                <TextField
                  key={key}
                  label={variableLabel(key)}
                  value={variables[key] ?? ""}
                  onChange={(v) => setVariables((prev) => ({ ...prev, [key]: v }))}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card p-5 space-y-2">
        <div className="text-xs font-medium text-[var(--muted-2)] uppercase tracking-wide">
          What they will actually receive
        </div>
        {!template ? (
          <p className="text-sm text-[var(--muted)]">
            No template is set up for this yet — set one up on the Templates page first.
          </p>
        ) : (
          <div className="rounded-xl p-4 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <div className="font-semibold mb-2 text-[var(--ink)]">{previewSubject}</div>
            <pre className="whitespace-pre-wrap font-sans text-[var(--muted)]">{previewBody}</pre>
          </div>
        )}
      </section>

      <button
        onClick={send}
        disabled={!canSend}
        className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-sm"
      >
        <Send size={15} /> {sending ? "Sending…" : "Send This Email"}
      </button>
      {error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{error}</p>}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
