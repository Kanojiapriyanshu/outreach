"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, RotateCcw, Save } from "lucide-react";

interface PreviewData {
  subject: string;
  body: string;
  isOverridden: boolean;
}

export default function UpcomingFollowUpPreview({ scheduledActionId }: { scheduledActionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [data, setData] = useState<PreviewData | null>(null);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");

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
        {open ? "Hide preview" : "Preview & edit this follow-up"}
      </button>

      {open && (
        <div className="mt-3 rounded-xl p-4 space-y-2.5" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          {error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{error}</p>}
          {data && (
            <>
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
        </div>
      )}
    </div>
  );
}
