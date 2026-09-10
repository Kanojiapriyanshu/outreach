"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Send, RotateCcw, Trash2, FileText } from "lucide-react";
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

interface DraftState {
  emailAccountIdOverride: string | null;
  contactEmail: string;
  brandDetails: BrandDetails;
  creatorName: string;
  channelName: string;
  channelUrl: string;
  variables: Record<string, string>;
  sendTiming: "now" | "later";
  scheduledAtLocal: string;
  subjectDraft: string;
  bodyDraft: string;
  contentTouched: boolean;
}

const EMPTY_DRAFT: DraftState = {
  emailAccountIdOverride: null,
  contactEmail: "",
  brandDetails: EMPTY_BRAND_DETAILS,
  creatorName: "",
  channelName: "",
  channelUrl: "",
  variables: {},
  sendTiming: "now",
  scheduledAtLocal: "",
  subjectDraft: "",
  bodyDraft: "",
  contentTouched: false,
};

function draftKey(outreachType: "BRAND" | "CREATOR") {
  return `fidem_compose_draft_${outreachType}`;
}

function loadDraft(outreachType: "BRAND" | "CREATOR"): DraftState {
  try {
    const raw = localStorage.getItem(draftKey(outreachType));
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch {
    return EMPTY_DRAFT;
  }
}

export default function ComposeAndSend({
  outreachType,
  recipientType,
  onRecipientTypeChange,
  connectedAccounts,
}: {
  outreachType: "BRAND" | "CREATOR";
  recipientType: "DIRECT" | "AGENCY";
  onRecipientTypeChange: (v: "DIRECT" | "AGENCY") => void;
  connectedAccounts: ConnectedAccount[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledConfirmation, setScheduledConfirmation] = useState<string | null>(null);
  // Set when this compose session started from an explicit, server-saved draft (Drafts page ->
  // "Continue editing") — tracked so sending successfully can clean that draft row up instead of
  // leaving a stale duplicate behind once it's no longer just a draft.
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedConfirmation, setDraftSavedConfirmation] = useState<string | null>(null);
  // Computed once at mount, not on every render — Date.now() is impure and the "earliest you can
  // pick" only needs to be roughly "now," not updated live to the second.
  const [minScheduledAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));

  const emailAccountId = draft.emailAccountIdOverride ?? connectedAccounts[0]?.id ?? "";
  const contactName = outreachType === "BRAND" ? draft.brandDetails.contactName : draft.creatorName;

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // Load this outreach type's saved draft (if any) whenever we switch between Brand/Creator, and
  // on first mount — the draft otherwise survives everything: switching the Track page's other
  // tabs, navigating away entirely, even closing the browser, until explicitly cleared below.
  // localStorage isn't available during SSR, so this can only happen once mounted in the browser
  // — there's no external-store subscription to use instead of an effect here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(loadDraft(outreachType));
    setError(null);
    setScheduledConfirmation(null);
  }, [outreachType]);

  // A link from the Drafts page ("Continue editing") arrives as /track?draftId=X — load that
  // specific server-saved draft over whatever the per-type localStorage autosave had, once.
  const draftIdParam = searchParams.get("draftId");
  useEffect(() => {
    if (!draftIdParam) return;
    (async () => {
      try {
        const res = await fetch(`/api/drafts/${draftIdParam}`);
        if (!res.ok) return;
        const data = await res.json();
        setDraft({ ...EMPTY_DRAFT, ...(data.draft.payload as Partial<DraftState>) });
        setLoadedDraftId(draftIdParam);
      } catch {
        // Missing/stale draft link — just leave whatever draft was already loaded.
      }
    })();
  }, [draftIdParam]);

  // Skips the very first save-on-load-tick so loading a draft doesn't immediately re-save it
  // (harmless either way, but avoids a redundant write on every mount).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(draftKey(outreachType), JSON.stringify(draft));
    } catch {
      // localStorage can throw in private-browsing/storage-full edge cases — losing draft
      // persistence there isn't worth failing the whole form over.
    }
  }, [draft, outreachType]);

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey(outreachType));
    } catch {
      // ignore
    }
    // This session started from a server-saved draft and just actually sent/scheduled — it's no
    // longer a draft, so the saved row would just be a stale duplicate sitting in Drafts forever.
    if (loadedDraftId) {
      fetch(`/api/drafts/${loadedDraftId}`, { method: "DELETE" }).catch(() => {});
      setLoadedDraftId(null);
    }
    setDraft(EMPTY_DRAFT);
    setScheduledConfirmation(null);
  }

  async function saveAsDraft() {
    setSavingDraft(true);
    setDraftSavedConfirmation(null);
    try {
      const body = {
        outreachType,
        recipientType,
        contactEmail: draft.contactEmail,
        contactName,
        emailAccountId: emailAccountId || null,
        payload: draft,
      };
      const res = loadedDraftId
        ? await fetch(`/api/drafts/${loadedDraftId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save draft");
      if (!loadedDraftId) setLoadedDraftId(data.draft.id);
      setDraftSavedConfirmation("Saved to Drafts.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save draft");
    } finally {
      setSavingDraft(false);
    }
  }

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

  const renderedVars: Record<string, string> =
    outreachType === "BRAND"
      ? {
          Contact_Name: draft.brandDetails.contactName || "{Contact_Name}",
          Brand_Or_Campaign_Name:
            (recipientType === "AGENCY" ? draft.brandDetails.campaignName : draft.brandDetails.brandName) ||
            "{Brand_Or_Campaign_Name}",
          Niche_Categories: draft.variables.Niche_Categories ?? "{Niche_Categories}",
          Key_Product_Features: draft.variables.Key_Product_Features ?? "{Key_Product_Features}",
          Target_Audience_Or_Angle: draft.variables.Target_Audience_Or_Angle ?? "{Target_Audience_Or_Angle}",
        }
      : { ...draft.variables, Contact_Name: draft.creatorName || "{Contact_Name}" };
  const renderedSubject = template ? renderTemplate(template.subject, renderedVars) : "";
  const renderedBody = template ? renderTemplate(template.body, renderedVars) : "";

  // The editable subject/body track whatever's typed into the form above — right up until the
  // team edits the final draft directly, at which point their edit wins and stops getting
  // overwritten by every keystroke elsewhere. "Reset to template" below un-sticks it. Plain
  // derived values, not synced via an effect — nothing here reaches outside React.
  const effectiveSubject = draft.contentTouched ? draft.subjectDraft : renderedSubject;
  const effectiveBody = draft.contentTouched ? draft.bodyDraft : renderedBody;

  function resetToTemplate() {
    setDraft((prev) => ({ ...prev, contentTouched: false }));
  }

  async function send() {
    setSending(true);
    setError(null);
    setScheduledConfirmation(null);
    try {
      const res = await fetch("/api/sequences/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outreachType,
          scheduledAt: draft.sendTiming === "later" && draft.scheduledAtLocal ? new Date(draft.scheduledAtLocal).toISOString() : undefined,
          recipientType: outreachType === "BRAND" ? recipientType : undefined,
          emailAccountId,
          contactEmail: draft.contactEmail,
          contactName,
          // Whatever's currently in the editable draft box is exactly what gets sent — the same
          // text the team can see and has full freedom to rewrite, trim, or leave as-is.
          templateOverrideSubject: effectiveSubject,
          templateOverrideBody: effectiveBody,
          brand:
            outreachType === "BRAND"
              ? {
                  name: draft.brandDetails.brandName,
                  campaignName: recipientType === "AGENCY" ? draft.brandDetails.campaignName : undefined,
                  website: draft.brandDetails.website,
                  category: draft.brandDetails.category,
                  budgetRangeText: draft.brandDetails.budgetRangeText,
                  budgetType: draft.brandDetails.budgetType,
                  influencerRangeMin: draft.brandDetails.influencerRangeMin ? Number(draft.brandDetails.influencerRangeMin) : undefined,
                  influencerRangeMax: draft.brandDetails.influencerRangeMax ? Number(draft.brandDetails.influencerRangeMax) : undefined,
                  deliverables: draft.brandDetails.deliverables,
                  campaignTimeline: draft.brandDetails.campaignTimeline,
                }
              : undefined,
          creator:
            outreachType === "CREATOR"
              ? { name: draft.creatorName, channelName: draft.channelName, channelUrl: draft.channelUrl, niche: draft.variables.Niche_Or_Product_Category }
              : undefined,
          variables:
            outreachType === "BRAND"
              ? {
                  Niche_Categories: draft.variables.Niche_Categories,
                  Key_Product_Features: draft.variables.Key_Product_Features,
                  Target_Audience_Or_Angle: draft.variables.Target_Audience_Or_Angle,
                }
              : draft.variables,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      if (data.scheduled) {
        setScheduledConfirmation(`Scheduled — this will send on ${new Date(data.scheduledAt).toLocaleString()}.`);
        clearDraft();
        return;
      }
      clearDraft();
      router.push(`/dashboard/${data.sequence.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const scheduleTimeMissing = draft.sendTiming === "later" && !draft.scheduledAtLocal;
  const canSend =
    !sending && !!draft.contactEmail && !!contactName && !!template && connectedAccounts.length > 0 && !scheduleTimeMissing;

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-sm text-[var(--ink)]">
              Write & Send the First Email ({outreachType === "BRAND" ? "Brand" : "Creator"})
            </h2>
            <p className="text-xs text-[var(--muted)] mt-1">
              This sends right away from your own Gmail — exactly as if you had typed and hit Send yourself. The
              automatic follow-up reminders kick in right after. Your progress here is saved automatically, even if
              you switch tabs or come back later.
            </p>
          </div>
          <button
            type="button"
            onClick={clearDraft}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-2)] hover:text-[var(--danger-fg)] shrink-0"
            title="Clear everything typed here and start over"
          >
            <Trash2 size={13} /> Clear draft
          </button>
        </div>

        {connectedAccounts.length === 0 && (
          <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
            You have not connected a Gmail account yet — do that in Settings first.
          </p>
        )}
        {connectedAccounts.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Send from which inbox?</label>
            <select className="input" value={emailAccountId} onChange={(e) => update("emailAccountIdOverride", e.target.value)}>
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
            onRecipientTypeChange={onRecipientTypeChange}
            contactEmail={draft.contactEmail}
            onContactEmailChange={(v) => update("contactEmail", v)}
            details={draft.brandDetails}
            onDetailsChange={(v) => update("brandDetails", v)}
            variables={draft.variables}
            onVariablesChange={(v) => update("variables", v)}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Their email address" value={draft.contactEmail} onChange={(v) => update("contactEmail", v)} />
              <TextField label="Their name" value={draft.creatorName} onChange={(v) => update("creatorName", v)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Channel name (optional)" value={draft.channelName} onChange={(v) => update("channelName", v)} />
              <TextField label="Channel link (optional)" value={draft.channelUrl} onChange={(v) => update("channelUrl", v)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CREATOR_VARIABLES.filter((k) => k !== "Creator_Name").map((key) => (
                <TextField
                  key={key}
                  label={variableLabel(key)}
                  value={draft.variables[key] ?? ""}
                  onChange={(v) => update("variables", { ...draft.variables, [key]: v })}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card p-5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-[var(--muted-2)] uppercase tracking-wide">
            What they will actually receive — edit freely, nothing here is mandatory
          </div>
          {draft.contentTouched && (
            <button
              type="button"
              onClick={resetToTemplate}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-2)] hover:text-[var(--ink)]"
              title="Discard your edits and go back to the live template"
            >
              <RotateCcw size={12} /> Reset to template
            </button>
          )}
        </div>
        {!template ? (
          <p className="text-sm text-[var(--muted)]">
            No template is set up for this yet — set one up on the Templates page first.
          </p>
        ) : (
          <div className="space-y-2">
            <input
              className="input font-semibold"
              value={effectiveSubject}
              onChange={(e) => setDraft((prev) => ({ ...prev, subjectDraft: e.target.value, contentTouched: true }))}
              placeholder="Subject"
            />
            <textarea
              className="input font-sans"
              style={{ minHeight: 220, resize: "vertical" }}
              value={effectiveBody}
              onChange={(e) => setDraft((prev) => ({ ...prev, bodyDraft: e.target.value, contentTouched: true }))}
              placeholder="Email body"
            />
            <p className="text-xs text-[var(--muted-2)]">
              This is exactly what gets sent — any {"{tag}"} left in here goes out as literal text, so replace or
              delete anything you don&apos;t want. Fields above just help pre-fill it; you don&apos;t have to fill
              in every one of them.
            </p>
          </div>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-[var(--ink)]">When should this go out?</h2>
        <div className="flex gap-2">
          <TimingButton label="Send now" active={draft.sendTiming === "now"} onClick={() => update("sendTiming", "now")} />
          <TimingButton label="Schedule for later" active={draft.sendTiming === "later"} onClick={() => update("sendTiming", "later")} />
        </div>
        {draft.sendTiming === "later" && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Date and time</label>
            <input
              type="datetime-local"
              className="input"
              value={draft.scheduledAtLocal}
              min={minScheduledAt}
              onChange={(e) => update("scheduledAtLocal", e.target.value)}
            />
            <p className="text-xs text-[var(--muted-2)] mt-1.5">
              Just like Gmail&apos;s schedule send — this email is queued and goes out automatically at the time you pick.
            </p>
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={send}
          disabled={!canSend}
          className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 text-sm"
        >
          <Send size={15} />
          {sending
            ? draft.sendTiming === "later"
              ? "Scheduling…"
              : "Sending…"
            : draft.sendTiming === "later"
              ? "Schedule This Email"
              : "Send This Email"}
        </button>
        <button
          onClick={saveAsDraft}
          disabled={savingDraft}
          className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm"
        >
          <FileText size={15} />
          {savingDraft ? "Saving…" : loadedDraftId ? "Update Draft" : "Save as Draft"}
        </button>
      </div>
      {error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{error}</p>}
      {draftSavedConfirmation && (
        <p className="text-sm" style={{ color: "var(--success-fg)" }}>
          {draftSavedConfirmation}{" "}
          <Link href="/drafts" className="underline font-medium">
            View all drafts →
          </Link>
        </p>
      )}
      {scheduledConfirmation && (
        <p className="text-sm" style={{ color: "var(--success-fg)" }}>
          {scheduledConfirmation}{" "}
          <Link href="/scheduled" className="underline font-medium">
            View all scheduled emails →
          </Link>
        </p>
      )}
    </div>
  );
}

function TimingButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={active ? "btn-primary px-4 py-2 text-sm" : "btn-secondary px-4 py-2 text-sm"}>
      {label}
    </button>
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
