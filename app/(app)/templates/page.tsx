"use client";

import { useEffect, useState } from "react";
import { Eye, Code2, RotateCcw, Check } from "lucide-react";
import { renderTemplate, variablesForType } from "@/lib/templates";
import { variableLabel } from "@/lib/friendlyLabels";

interface Template {
  id: string;
  outreachType: "BRAND" | "CREATOR";
  recipientType: "DIRECT" | "AGENCY";
  step: number;
  name: string;
  subject: string;
  body: string;
  version: number;
}

const PREVIEW_SAMPLE: Record<string, string> = {
  Contact_Name: "Summer",
  Brand_Or_Campaign_Name: "Whale Echo",
  Niche_Categories: "tech & audio",
  Key_Product_Features: "AI auto-tracking",
  Target_Audience_Or_Angle: "WFH setup",
  Creator_Name: "TechDo",
  Niche_Or_Product_Category: "tech gadget",
  Deliverable_Type: "dedicated review",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [track, setTrack] = useState<"BRAND" | "CREATOR">("BRAND");
  const [recipientType, setRecipientType] = useState<"DIRECT" | "AGENCY">("DIRECT");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load(keepSelection = false) {
    setLoading(true);
    const res = await fetch("/api/templates");
    const data = await res.json();
    setTemplates(data.templates);
    setLoading(false);
    if (!keepSelection) {
      const first = (data.templates as Template[]).find(
        (t) => t.outreachType === track && t.recipientType === recipientType
      );
      setSelectedId(first?.id ?? null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() is stable enough for a mount-only fetch
  }, []);

  const list = templates
    .filter((t) => t.outreachType === track && t.recipientType === recipientType)
    .sort((a, b) => a.step - b.step);
  const selected = templates.find((t) => t.id === selectedId) ?? list[0] ?? null;

  function switchTrack(next: "BRAND" | "CREATOR") {
    setTrack(next);
    const nextRecipient = next === "CREATOR" ? "DIRECT" : recipientType;
    setRecipientType(nextRecipient);
    const first = templates
      .filter((t) => t.outreachType === next && t.recipientType === nextRecipient)
      .sort((a, b) => a.step - b.step)[0];
    setSelectedId(first?.id ?? null);
  }

  function switchRecipientType(next: "DIRECT" | "AGENCY") {
    setRecipientType(next);
    const first = templates
      .filter((t) => t.outreachType === track && t.recipientType === next)
      .sort((a, b) => a.step - b.step)[0];
    setSelectedId(first?.id ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Email Templates</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            These are the emails that go out automatically. Brand and creator emails are kept completely separate.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {track === "BRAND" && (
            <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--neutral-bg)" }}>
              <SegButton active={recipientType === "DIRECT"} onClick={() => switchRecipientType("DIRECT")} label="Direct" />
              <SegButton active={recipientType === "AGENCY"} onClick={() => switchRecipientType("AGENCY")} label="Agency" />
            </div>
          )}
          <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--neutral-bg)" }}>
            <SegButton active={track === "BRAND"} onClick={() => switchTrack("BRAND")} label="Brand" />
            <SegButton active={track === "CREATOR"} onClick={() => switchTrack("CREATOR")} label="Creator" />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--muted)] text-sm">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
          <div className="card p-2 space-y-1 self-start">
            {list.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{
                  background: selected?.id === t.id ? "var(--brand-teal-light)" : "transparent",
                }}
              >
                <span
                  className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0"
                  style={{
                    background: selected?.id === t.id ? "var(--brand-teal)" : "var(--neutral-bg)",
                    color: selected?.id === t.id ? "#fff" : "var(--muted)",
                  }}
                >
                  {t.step}
                </span>
                <span className="min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: selected?.id === t.id ? "var(--brand-teal-dark)" : "var(--ink)" }}
                  >
                    {t.name}
                  </div>
                  <div className="text-xs text-[var(--muted-2)]">Version {t.version}</div>
                </span>
              </button>
            ))}
          </div>

          {selected && <TemplateEditor key={selected.id} template={selected} onSaved={() => load(true)} />}
        </div>
      )}
    </div>
  );
}

function SegButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors"
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

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Eye;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors"
      style={{
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--ink)" : "var(--muted)",
        boxShadow: active ? "var(--shadow-card)" : "none",
      }}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function TemplateEditor({ template, onSaved }: { template: Template; onSaved: () => void }) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const variables = variablesForType(template.outreachType);
  const dirty = subject !== template.subject || body !== template.body;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save your changes — try again.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your changes — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm(`Undo your edits to "${template.name}" and go back to the original wording?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't reset this template — try again.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset this template — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-[15px] text-[var(--ink)]">{template.name}</h2>
            <span className="text-xs text-[var(--muted-2)]">Version {template.version}</span>
            {dirty && (
              <span className="badge" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 p-1 rounded-full" style={{ background: "var(--neutral-bg)" }}>
          <TabButton active={tab === "edit"} onClick={() => setTab("edit")} icon={Code2} label="Edit" />
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")} icon={Eye} label="Preview" />
        </div>
      </div>

      <div>
        <p className="text-xs text-[var(--muted-2)] mb-1.5">
          These get filled in automatically for each person — type the text in curly braces anywhere in the email:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <span
              key={v}
              className="text-xs px-2 py-1 rounded-md"
              style={{ background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }}
              title={variableLabel(v)}
            >
              {variableLabel(v)} <code className="font-mono opacity-70">{`{${v}}`}</code>
            </span>
          ))}
        </div>
      </div>

      {tab === "edit" ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Body</label>
            <textarea
              className="input font-mono text-[13px] leading-relaxed"
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-5 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-medium text-[var(--muted-2)] mb-3 uppercase tracking-wide">
            Preview with sample data
          </div>
          <div className="font-semibold mb-3 text-[var(--ink)]">{renderTemplate(subject, PREVIEW_SAMPLE)}</div>
          <pre className="whitespace-pre-wrap font-sans text-[var(--muted)] leading-relaxed">
            {renderTemplate(body, PREVIEW_SAMPLE)}
          </pre>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
        <button onClick={reset} disabled={saving} className="btn-danger inline-flex items-center gap-1.5 px-4 py-2 text-sm">
          <RotateCcw size={14} /> Undo My Edits
        </button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Check size={15} /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
