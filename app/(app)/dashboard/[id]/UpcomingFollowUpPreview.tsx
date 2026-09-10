"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, RotateCcw, Save, CalendarClock } from "lucide-react";

interface PreviewData {
  subject: string;
  body: string;
  isOverridden: boolean;
  scheduledAt: string;
}

/** "YYYY-MM-DDTHH:mm" in the browser's own local time — what <input type="datetime-local"> needs,
 * and matches how the team already picks times when first attaching a thread (track/page.tsx). */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function UpcomingFollowUpPreview({
  scheduledActionId,
  status,
}: {
  scheduledActionId: string;
  status: "PENDING" | "CANCELLED";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduled, setRescheduled] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [cancelDeleteBusy, setCancelDeleteBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/scheduled-actions/${scheduledActionId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load the preview");
      setData(json);
      setSubjectDraft(json.subject);
      setBodyDraft(json.body);
      setScheduleDraft(toLocalInputValue(json.scheduledAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the preview");
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) await load();
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-actions/${scheduledActionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subjectDraft, body: bodyDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save your edit");
      setData((prev) => (prev ? { ...prev, subject: subjectDraft, body: bodyDraft, isOverridden: true } : prev));
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your edit");
    } finally {
      setSaving(false);
    }
  }

  async function reschedule() {
    if (!scheduleDraft) return;
    setRescheduling(true);
    setError(null);
    try {
      const iso = new Date(scheduleDraft).toISOString();
      const res = await fetch(`/api/scheduled-actions/${scheduledActionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: iso }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't reschedule this");
      setData((prev) => (prev ? { ...prev, scheduledAt: iso } : prev));
      setRescheduled(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reschedule this");
    } finally {
      setRescheduling(false);
    }
  }

  async function cancel() {
    setCancelDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-actions/${scheduledActionId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't cancel — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel — try again.");
      setCancelDeleteBusy(false);
      setConfirmingCancel(false);
    }
  }

  async function deleteForever() {
    setCancelDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-actions/${scheduledActionId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't delete — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete — try again.");
      setCancelDeleteBusy(false);
      setConfirmingDelete(false);
    }
  }

  async function resetToTemplate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-actions/${scheduledActionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't reset this");
      setSaved(false);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset this");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--brand-teal-dark)" }}
      >
        {open ? <EyeOff size={13} /> : <Eye size={13} />}
        {open ? "Hide" : status === "CANCELLED" ? "Reschedule or delete this cancelled follow-up" : "Preview & edit this follow-up"}
      </button>

      {open && (
        <div className="mt-3 rounded-xl p-4 space-y-2.5" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          {error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{error}</p>}
          {data && (
            <>
              {status === "PENDING" && (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-[var(--muted-2)]">
                    This is exactly what will be sent when it goes out — edit it directly if you want it different, no
                    {" {tag}"} is required.
                  </p>
                  {data.isOverridden && (
                    <button
                      type="button"
                      onClick={resetToTemplate}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-2)] hover:text-[var(--ink)] shrink-0"
                      title="Discard your edit and go back to the live template"
                    >
                      <RotateCcw size={12} /> Reset to template
                    </button>
                  )}
                </div>
              )}

              <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
                  <CalendarClock size={13} /> {status === "CANCELLED" ? "Reschedule to send again" : "When this goes out"}
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="datetime-local"
                    className="input max-w-xs"
                    value={scheduleDraft}
                    onChange={(e) => {
                      setScheduleDraft(e.target.value);
                      setRescheduled(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={reschedule}
                    disabled={
                      rescheduling || !scheduleDraft || (status === "PENDING" && toLocalInputValue(data.scheduledAt) === scheduleDraft)
                    }
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    {rescheduling ? "Saving…" : "Reschedule"}
                  </button>
                  {rescheduled && (
                    <span className="text-xs" style={{ color: "var(--success-fg)" }}>
                      {status === "CANCELLED" ? "Reopened." : "Rescheduled."}
                    </span>
                  )}
                </div>
              </div>

              {status === "PENDING" && !confirmingCancel && (
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Cancel this follow-up
                </button>
              )}
              {confirmingCancel && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--muted)]">Cancel this follow-up? It won&rsquo;t go out unless rescheduled.</span>
                  <button onClick={cancel} disabled={cancelDeleteBusy} className="btn-danger px-2.5 py-1 text-xs">
                    {cancelDeleteBusy ? "…" : "Yes, cancel"}
                  </button>
                  <button onClick={() => setConfirmingCancel(false)} disabled={cancelDeleteBusy} className="btn-secondary px-2.5 py-1 text-xs">
                    Never mind
                  </button>
                </div>
              )}

              {status === "CANCELLED" && !confirmingDelete && (
                <button type="button" onClick={() => setConfirmingDelete(true)} className="btn-danger px-3 py-1.5 text-xs">
                  Delete for good
                </button>
              )}
              {confirmingDelete && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--muted)]">Delete this cancelled follow-up for good?</span>
                  <button onClick={deleteForever} disabled={cancelDeleteBusy} className="btn-danger px-2.5 py-1 text-xs">
                    {cancelDeleteBusy ? "…" : "Yes, delete"}
                  </button>
                  <button onClick={() => setConfirmingDelete(false)} disabled={cancelDeleteBusy} className="btn-secondary px-2.5 py-1 text-xs">
                    Never mind
                  </button>
                </div>
              )}

              {status === "PENDING" && (
                <>
                  <input
                    className="input font-semibold"
                    value={subjectDraft}
                    onChange={(e) => setSubjectDraft(e.target.value)}
                    placeholder="Subject"
                  />
                  <textarea
                    className="input font-sans"
                    style={{ minHeight: 180, resize: "vertical" }}
                    value={bodyDraft}
                    onChange={(e) => setBodyDraft(e.target.value)}
                    placeholder="Follow-up body"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving || (subjectDraft === data.subject && bodyDraft === data.body)}
                      className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <Save size={13} /> {saving ? "Saving…" : "Save Edit"}
                    </button>
                    {saved && <span className="text-xs" style={{ color: "var(--success-fg)" }}>Saved.</span>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
