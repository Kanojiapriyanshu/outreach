"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { parseCsv } from "@/lib/csv";

interface ConnectedAccount {
  id: string;
  email: string;
  accessStatus: string;
}

interface RowResult {
  contactEmail: string;
  status: "tracked" | "sent" | "duplicate" | "no_sent_email_found" | "error";
  detail?: string;
}

const ROW_STATUS_LABEL: Record<RowResult["status"], string> = {
  tracked: "Added",
  sent: "Sent",
  duplicate: "Already added",
  no_sent_email_found: "No sent email found",
  error: "Couldn't add",
};

const BRAND_COLUMNS =
  "contact_email,contact_name,recipient_type,brand_name,campaign_name,website,category,budget_range_text,budget_type,influencer_range_min,influencer_range_max,deliverables,campaign_timeline,niche_categories,key_product_features,target_audience_or_angle";
const CREATOR_COLUMNS =
  "contact_email,contact_name,creator_name,channel_name,channel_url,niche_or_product_category,deliverable_type";

export default function BulkImport({
  outreachType,
  connectedAccounts,
}: {
  outreachType: "BRAND" | "CREATOR";
  connectedAccounts: ConnectedAccount[];
}) {
  const [bulkMode, setBulkMode] = useState<"attach" | "compose">("attach");
  const [csvText, setCsvText] = useState("");
  const [emailAccountId, setEmailAccountId] = useState(connectedAccounts[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = outreachType === "BRAND" ? BRAND_COLUMNS : CREATOR_COLUMNS;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function run() {
    setError(null);
    setResults(null);
    if (!emailAccountId) {
      setError("Pick which Gmail account to use first.");
      return;
    }
    const parsed = parseCsv(csvText);
    if (parsed.length === 0) {
      setError("No rows found — upload a file or paste the spreadsheet text first.");
      return;
    }
    if (bulkMode === "compose") {
      const confirmed = confirm(
        `This will send a real email to ${parsed.length} people right now — this can't be undone. Continue?`
      );
      if (!confirmed) return;
    }

    const rows = parsed.map((r) => ({
      contactEmail: r.contact_email,
      contactName: r.contact_name,
      recipientType: r.recipient_type?.toUpperCase() === "AGENCY" ? ("AGENCY" as const) : ("DIRECT" as const),
      brandName: r.brand_name,
      // Only used for AGENCY rows — the client brand/product to reference inside the email
      // itself, since brand_name is the agency's own name there, not the client's.
      campaignName: r.campaign_name,
      website: r.website,
      category: r.category,
      budgetRangeText: r.budget_range_text,
      budgetType: (r.budget_type?.toUpperCase() as
        | "FLAT_FEE"
        | "COMMISSION"
        | "PRODUCT_ONLY"
        | "HYBRID"
        | "UNKNOWN"
        | undefined) || "UNKNOWN",
      influencerRangeMin: r.influencer_range_min ? Number(r.influencer_range_min) : undefined,
      influencerRangeMax: r.influencer_range_max ? Number(r.influencer_range_max) : undefined,
      deliverables: r.deliverables,
      campaignTimeline: r.campaign_timeline,
      creatorName: r.creator_name,
      channelName: r.channel_name,
      channelUrl: r.channel_url,
      variables:
        outreachType === "BRAND"
          ? {
              Niche_Categories: r.niche_categories,
              Key_Product_Features: r.key_product_features,
              Target_Audience_Or_Angle: r.target_audience_or_angle,
            }
          : {
              Niche_Or_Product_Category: r.niche_or_product_category,
              Deliverable_Type: r.deliverable_type,
            },
    }));

    setRunning(true);
    try {
      const res = await fetch("/api/sequences/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: bulkMode, outreachType, emailAccountId, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong — nothing was added.");
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — nothing was added.");
    } finally {
      setRunning(false);
    }
  }

  const successCount = results?.filter((r) => r.status === "tracked" || r.status === "sent").length ?? 0;

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-sm text-[var(--ink)]">
            Upload a List of {outreachType === "BRAND" ? "Brands" : "Creators"}
          </h2>
          <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--neutral-bg)" }}>
            <BulkModeButton active={bulkMode === "attach"} onClick={() => setBulkMode("attach")} label="Already Sent" />
            <BulkModeButton active={bulkMode === "compose"} onClick={() => setBulkMode("compose")} label="Write & Send" />
          </div>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {bulkMode === "attach" ? (
            <>
              Use this if you have <strong>already emailed everyone on this list</strong> yourself. We will look
              through your Sent mail for each address and pick up the most recent one. Anyone we cannot find gets
              skipped and shown below — nothing is sent on your behalf.
            </>
          ) : (
            <>
              This will <strong>send a brand-new first email to every person on the list</strong>, using whichever
              template is active for this track, then start the automatic follow-ups. Double-check your spreadsheet
              first — this is a real send, not a test.
            </>
          )}
        </p>
        <div>
          <p className="text-xs font-medium text-[var(--muted)] mb-1.5">
            Your spreadsheet needs these column names in the first row:
          </p>
          <div className="rounded-lg p-3 text-xs font-mono overflow-x-auto" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            {columns}
          </div>
        </div>

        {connectedAccounts.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
              {bulkMode === "attach" ? "Which inbox did you send these from?" : "Send from which inbox?"}
            </label>
            <select className="input" value={emailAccountId} onChange={(e) => setEmailAccountId(e.target.value)}>
              {connectedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Upload a spreadsheet (CSV file)</label>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Or paste the spreadsheet text here</label>
          <textarea
            className="input font-mono text-[12px]"
            rows={8}
            placeholder={columns}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
        </div>

        <button
          onClick={run}
          disabled={running || !csvText.trim() || connectedAccounts.length === 0}
          className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Upload size={15} /> {running ? "Working…" : bulkMode === "compose" ? "Send To Everyone" : "Add Them All"}
        </button>
        {error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{error}</p>}
      </section>

      {results && (
        <section className="card p-5 space-y-3">
          <h2 className="font-semibold text-sm text-[var(--ink)]">
            {successCount} of {results.length} {bulkMode === "compose" ? "emails sent" : "people added"}
          </h2>
          <div className="divide-y divide-[var(--border)]">
            {results.map((r, i) => (
              <div key={i} className="py-2 flex items-center justify-between text-sm">
                <span className="text-[var(--ink)]">{r.contactEmail || "(missing email)"}</span>
                <span
                  className="badge"
                  style={{
                    background:
                      r.status === "tracked" || r.status === "sent"
                        ? "var(--success-bg)"
                        : r.status === "duplicate"
                          ? "var(--neutral-bg)"
                          : "var(--danger-bg)",
                    color:
                      r.status === "tracked" || r.status === "sent"
                        ? "var(--success-fg)"
                        : r.status === "duplicate"
                          ? "var(--neutral-fg)"
                          : "var(--danger-fg)",
                  }}
                  title={r.detail}
                >
                  {ROW_STATUS_LABEL[r.status]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BulkModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 text-xs font-medium rounded-full transition-colors"
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
