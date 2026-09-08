"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CREATOR_VARIABLES } from "@/lib/templates";
import { variableLabel } from "@/lib/friendlyLabels";
import BulkImport from "./BulkImport";
import ComposeAndSend from "./ComposeAndSend";
import BrandDetailsForm, { EMPTY_BRAND_DETAILS, type BrandDetails } from "./BrandDetailsForm";

interface ThreadResult {
  messageId: string;
  threadId: string;
  subject: string;
  date: string;
}

interface ConnectedAccount {
  id: string;
  email: string;
  accessStatus: string;
}

// Everything the "I Already Sent It" tab and the top-level "Who is this for?" choice need to
// survive a tab switch, navigation away, or a page reload — the same fix applied to Write & Send.
interface AttachDraft {
  mode: "compose" | "attach" | "bulk";
  outreachType: "BRAND" | "CREATOR";
  recipientType: "DIRECT" | "AGENCY";
  contactEmail: string;
  brandDetails: BrandDetails;
  creatorName: string;
  channelName: string;
  channelUrl: string;
  variables: Record<string, string>;
}

const ATTACH_DRAFT_KEY = "fidem_track_page_draft";
const EMPTY_ATTACH_DRAFT: AttachDraft = {
  mode: "compose",
  outreachType: "BRAND",
  recipientType: "DIRECT",
  contactEmail: "",
  brandDetails: EMPTY_BRAND_DETAILS,
  creatorName: "",
  channelName: "",
  channelUrl: "",
  variables: {},
};

function loadAttachDraft(): AttachDraft {
  try {
    const raw = localStorage.getItem(ATTACH_DRAFT_KEY);
    if (!raw) return EMPTY_ATTACH_DRAFT;
    return { ...EMPTY_ATTACH_DRAFT, ...JSON.parse(raw) };
  } catch {
    return EMPTY_ATTACH_DRAFT;
  }
}

export default function TrackPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AttachDraft["mode"]>("compose");
  const [outreachType, setOutreachType] = useState<"BRAND" | "CREATOR">("BRAND");
  const [contactEmail, setContactEmail] = useState("");
  const [recipientType, setRecipientType] = useState<"DIRECT" | "AGENCY">("DIRECT");
  const [brandDetails, setBrandDetails] = useState<BrandDetails>(EMPTY_BRAND_DETAILS);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadResult[]>([]);
  const [emailAccountId, setEmailAccountId] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadResult | null>(null);
  const [creatorName, setCreatorName] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const data = await res.json();
      const connected = (data.emailAccounts as ConnectedAccount[]).filter((a) => a.accessStatus === "CONNECTED");
      setConnectedAccounts(connected);
      if (connected.length > 0) setEmailAccountId(connected[0].id);
    })();
  }, []);

  // Restore the saved draft once mounted — localStorage isn't available during SSR, so this can
  // only happen in the browser, not at render time.
  const isFirstLoad = useRef(true);
  useEffect(() => {
    const d = loadAttachDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(d.mode);
    setOutreachType(d.outreachType);
    setRecipientType(d.recipientType);
    setContactEmail(d.contactEmail);
    setBrandDetails(d.brandDetails);
    setCreatorName(d.creatorName);
    setChannelName(d.channelName);
    setChannelUrl(d.channelUrl);
    setVariables(d.variables);
  }, []);

  // Save on every change, skipping the very first tick (that's the restore above, not a real
  // change) so loading a draft doesn't immediately re-save it.
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    try {
      localStorage.setItem(
        ATTACH_DRAFT_KEY,
        JSON.stringify({ mode, outreachType, recipientType, contactEmail, brandDetails, creatorName, channelName, channelUrl, variables })
      );
    } catch {
      // localStorage can throw in private-browsing/storage-full edge cases — not worth failing
      // the form over losing draft persistence.
    }
  }, [mode, outreachType, recipientType, contactEmail, brandDetails, creatorName, channelName, channelUrl, variables]);

  async function searchThreads() {
    setSearchLoading(true);
    setSearchError(null);
    setThreads([]);
    setSelectedThread(null);
    try {
      const params = new URLSearchParams({ to: contactEmail });
      if (emailAccountId) params.set("emailAccountId", emailAccountId);
      const res = await fetch(`/api/gmail/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setThreads(data.results);
      setEmailAccountId(data.emailAccountId);
      if (data.results.length === 0) setSearchError("Couldn't find anything sent to that address. Make sure you've already sent the first email from Gmail, then try again.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  const contactName = outreachType === "BRAND" ? brandDetails.contactName : creatorName;

  async function submit() {
    if (!selectedThread || !emailAccountId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outreachType,
          recipientType: outreachType === "BRAND" ? recipientType : undefined,
          emailAccountId,
          threadId: selectedThread.threadId,
          initialMessageId: selectedThread.messageId,
          subject: selectedThread.subject,
          contactEmail,
          contactName,
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
          variables,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to track");
      router.push(`/dashboard/${data.sequence.id}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to track");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Start a New Outreach</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {mode === "compose"
              ? "Write the first email here and we'll send it and handle the reminders — or use the other tabs if you'd rather send it yourself from Gmail first."
              : "Already sent the first email from Gmail? Find it below and we'll take over the follow-ups. Nothing gets sent until you finish this form."}
          </p>
        </div>
        <div
          className="flex gap-1 p-1 rounded-full shrink-0 max-w-full overflow-x-auto"
          style={{ background: "var(--neutral-bg)", scrollbarWidth: "none" }}
        >
          <ModeButton active={mode === "compose"} onClick={() => setMode("compose")} label="Write & Send" />
          <ModeButton active={mode === "attach"} onClick={() => setMode("attach")} label="I Already Sent It" />
          <ModeButton active={mode === "bulk"} onClick={() => setMode("bulk")} label="Bulk Upload" />
        </div>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-sm text-[var(--ink)]">1. Who is this for?</h2>
        <div className="flex gap-2 flex-wrap">
          <RadioButton
            label="A brand, directly"
            checked={outreachType === "BRAND" && recipientType === "DIRECT"}
            onClick={() => {
              setOutreachType("BRAND");
              setRecipientType("DIRECT");
            }}
          />
          <RadioButton
            label="An agency (working on a brand's behalf)"
            checked={outreachType === "BRAND" && recipientType === "AGENCY"}
            onClick={() => {
              setOutreachType("BRAND");
              setRecipientType("AGENCY");
            }}
          />
          <RadioButton label="A content creator" checked={outreachType === "CREATOR"} onClick={() => setOutreachType("CREATOR")} />
        </div>
      </section>

      {mode === "compose" && (
        <ComposeAndSend
          outreachType={outreachType}
          recipientType={recipientType}
          onRecipientTypeChange={setRecipientType}
          connectedAccounts={connectedAccounts}
        />
      )}

      {mode === "bulk" && <BulkImport outreachType={outreachType} connectedAccounts={connectedAccounts} />}

      {mode === "attach" && (
        <>
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold text-sm text-[var(--ink)]">2. Find That Email</h2>
            {connectedAccounts.length === 0 && (
              <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
                You have not connected a Gmail account yet — do that in Settings first.
              </p>
            )}
            {connectedAccounts.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Which inbox did you send it from?</label>
                <select
                  className="input"
                  value={emailAccountId ?? ""}
                  onChange={(e) => setEmailAccountId(e.target.value)}
                >
                  {connectedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Who did you send it to?</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="summer@whaleecho.com"
              />
              <button
                onClick={searchThreads}
                disabled={!contactEmail || searchLoading || connectedAccounts.length === 0}
                className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm whitespace-nowrap"
              >
                <Search size={15} /> {searchLoading ? "Looking…" : "Find It"}
              </button>
            </div>
            {searchError && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{searchError}</p>}
            {threads.length > 0 && (
              <div className="space-y-2">
                {threads.map((t) => (
                  <label
                    key={t.messageId}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm cursor-pointer border transition-colors"
                    style={{
                      borderColor: selectedThread?.messageId === t.messageId ? "var(--brand-teal)" : "var(--border)",
                      background: selectedThread?.messageId === t.messageId ? "var(--brand-teal-light)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="thread"
                      checked={selectedThread?.messageId === t.messageId}
                      onChange={() => setSelectedThread(t)}
                    />
                    <div>
                      <div className="font-medium text-[var(--ink)]">{t.subject || "(no subject)"}</div>
                      <div className="text-[var(--muted-2)] text-xs mt-0.5">{t.date}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          {selectedThread && (
            <>
              <section className="card p-5 space-y-3">
                <h2 className="font-semibold text-sm text-[var(--ink)]">3. Tell Us About Them</h2>
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
                    <TextField label="Their name" value={creatorName} onChange={setCreatorName} />
                    <TextField label="Channel name (optional)" value={channelName} onChange={setChannelName} />
                    <TextField label="Channel link (optional)" value={channelUrl} onChange={setChannelUrl} />
                  </>
                )}
              </section>

              {outreachType === "CREATOR" && (
                <section className="card p-5 space-y-3">
                  <h2 className="font-semibold text-sm text-[var(--ink)]">4. Fill In the Details</h2>
                  {CREATOR_VARIABLES.filter((k) => k !== "Creator_Name").map((key) => (
                    <TextField
                      key={key}
                      label={variableLabel(key)}
                      value={variables[key] ?? ""}
                      onChange={(v) => setVariables((prev) => ({ ...prev, [key]: v }))}
                    />
                  ))}
                </section>
              )}

              <button onClick={submit} disabled={submitting} className="btn-primary px-5 py-2.5 text-sm">
                {submitting ? "Starting…" : "Start the Follow-Ups"}
              </button>
              {submitError && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{submitError}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap"
      style={{
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--ink)" : "var(--muted)",
        boxShadow: active ? "var(--shadow-card)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function RadioButton({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={checked ? "btn-primary px-4 py-2 text-sm" : "btn-secondary px-4 py-2 text-sm"}>
      {label}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
