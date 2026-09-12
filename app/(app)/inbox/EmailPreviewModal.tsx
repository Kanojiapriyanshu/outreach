"use client";

import { useState } from "react";
import { X, CalendarClock, Paperclip, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/formatDate";
import type { PendingAttachment } from "./composerParts";

/**
 * The full-preview step Gmail skips but a CRM that turns some sends into an automated multi-email
 * sequence shouldn't: scheduling here isn't just "send this later," it can also mean "start
 * tracking this contact and queue follow-ups on their behalf." Confirming a scheduled send goes
 * through this exact rendering — not a summary of it — so what gets confirmed is what actually
 * goes out, and what kind of automation it starts.
 */
export default function EmailPreviewModal({
  fromEmail,
  to,
  cc,
  bcc,
  subject,
  html,
  attachments,
  scheduledAt,
  classificationLabel,
  onEdit,
  onConfirm,
}: {
  fromEmail: string | null;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments: PendingAttachment[];
  scheduledAt: Date;
  classificationLabel: string;
  onEdit: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't schedule that — try again.");
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col card shadow-xl" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-sm font-semibold text-[var(--ink)]">Preview before scheduling</span>
          <button onClick={onEdit} aria-label="Close" className="p-1 rounded text-[var(--muted)] hover:bg-[var(--bg)]">
            <X size={16} />
          </button>
        </div>

        <div
          className="flex items-center gap-2 px-4 py-2.5 text-[13px] border-b border-[var(--border)] shrink-0"
          style={{ background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }}
        >
          <CalendarClock size={14} />
          <span className="font-medium">Sends {formatDateTime(scheduledAt)}</span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/50">{classificationLabel}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-[13px]">
          {fromEmail && (
            <div className="flex gap-2">
              <span className="w-14 shrink-0 text-[var(--muted-2)]">From</span>
              <span className="text-[var(--ink)]">{fromEmail}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="w-14 shrink-0 text-[var(--muted-2)]">To</span>
            <span className="text-[var(--ink)] break-all">{to}</span>
          </div>
          {cc && (
            <div className="flex gap-2">
              <span className="w-14 shrink-0 text-[var(--muted-2)]">Cc</span>
              <span className="text-[var(--ink)] break-all">{cc}</span>
            </div>
          )}
          {bcc && (
            <div className="flex gap-2">
              <span className="w-14 shrink-0 text-[var(--muted-2)]">Bcc</span>
              <span className="text-[var(--ink)] break-all">{bcc}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="w-14 shrink-0 text-[var(--muted-2)]">Subject</span>
            <span className="text-[var(--ink)] font-medium">{subject || "(no subject)"}</span>
          </div>

          <div
            className="mt-2 rounded-lg border border-[var(--border)] p-3 text-[13px] leading-relaxed text-[var(--ink)] overflow-x-auto"
            style={{ background: "var(--bg)" }}
            dangerouslySetInnerHTML={{ __html: html || "<p style='color:var(--muted-2)'>(empty message)</p>" }}
          />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {attachments.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--muted)]"
                  style={{ background: "var(--bg)" }}
                >
                  <Paperclip size={11} /> {a.filename}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="px-4 pb-1 text-xs" style={{ color: "var(--danger-fg)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border)] shrink-0">
          <button onClick={confirm} disabled={confirming} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
            {confirming ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            {confirming ? "Scheduling…" : "Confirm & Schedule"}
          </button>
          <button onClick={onEdit} disabled={confirming} className="btn-secondary px-4 py-2 text-sm">
            Keep Editing
          </button>
        </div>
      </div>
    </div>
  );
}
