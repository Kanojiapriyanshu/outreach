"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, Plus, RotateCcw, Trash2 } from "lucide-react";
import { CLAUSES, PROTECTIVE_CLAUSES, standardBody, type BuiltContract, type ContractData } from "@/lib/contracts/template";

// These carry the parties, the deal table and the signatures — the contract isn't one without them.
const FIXED = new Set(["parties", "scope"]);

/**
 * Every clause, in order: include or drop it, rewrite its wording, or add clauses of your own.
 * Numbering and "Clause N" references follow automatically.
 */
export default function ClausesPanel({
  data,
  built,
  setData,
  onShow,
}: {
  data: ContractData;
  built: BuiltContract;
  setData: (change: (d: ContractData) => ContractData) => void;
  onShow: (sectionId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const numberOf = new Map(built.sections.map((s) => [s.id, s.number]));
  const editedIds = new Set(built.sections.filter((s) => s.edited && !s.custom).map((s) => s.id));

  function setEdit(id: string, change: (e: ContractData["edits"][string]) => ContractData["edits"][string] | undefined) {
    setData((d) => {
      const next = { ...d.edits };
      const value = change(d.edits[id] ?? {});
      if (!value || (value.text === undefined && !value.removed)) delete next[id];
      else next[id] = value;
      return { ...d, edits: next };
    });
  }

  function addCustom() {
    const id = `custom-${Date.now().toString(36)}`;
    setData((d) => ({ ...d, custom: [...d.custom, { id, title: "Additional Terms", text: "" }] }));
    setOpen(id);
  }

  const rows: { id: string; custom: boolean }[] = [];
  for (const c of CLAUSES) {
    if (c.id === "entire") data.custom.forEach((cc) => rows.push({ id: cc.id, custom: true }));
    rows.push({ id: c.id, custom: false });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--muted)]">
        Rewrite any clause for this brand, or leave it out. Edited wording shows as tracked changes against your standard agreement on the right.
      </p>

      {rows.map(({ id, custom }) => {
        const def = CLAUSES.find((c) => c.id === id);
        const cc = data.custom.find((c) => c.id === id);
        const removed = !!data.edits[id]?.removed;
        const edited = editedIds.has(id);
        const isOpen = open === id;
        const title = custom ? cc?.title || "Additional Terms" : def!.title;
        const number = numberOf.get(id);

        return (
          <div key={id} className="rounded-lg border border-[var(--border)]" style={{ opacity: removed ? 0.6 : 1, background: "var(--surface)" }}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => setOpen(isOpen ? null : id)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left" disabled={removed || (!custom && !def?.body)}>
                {!custom && !def?.body ? <span className="w-[13px]" /> : isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="text-sm text-[var(--ink)] truncate">
                  {number ? `${number}. ` : ""}
                  {removed ? <s>{title}</s> : title}
                </span>
              </button>
              {custom && <Badge tone="info">Custom</Badge>}
              {edited && <Badge tone="warn">Edited</Badge>}
              {removed && <Badge tone="danger">Removed</Badge>}
              {!removed && (
                <button type="button" onClick={() => onShow(id)} className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)]" title="Show in the contract">
                  <Eye size={13} />
                </button>
              )}
              {custom ? (
                <button type="button" onClick={() => setData((d) => ({ ...d, custom: d.custom.filter((c) => c.id !== id) }))} className="p-1 rounded text-[var(--muted)] hover:text-[var(--danger-fg)]" title="Delete this clause">
                  <Trash2 size={13} />
                </button>
              ) : (
                !FIXED.has(id) && (
                  <label className="flex items-center gap-1 text-[11px] text-[var(--muted)] cursor-pointer" title={PROTECTIVE_CLAUSES.has(id) ? "This clause protects Fidem" : undefined}>
                    <input type="checkbox" checked={!removed} onChange={(e) => setEdit(id, (x) => ({ ...x, removed: !e.target.checked }))} />
                    Include
                  </label>
                )
              )}
            </div>

            {isOpen && !removed && (
              <div className="px-3 pb-3 space-y-2">
                {custom && cc ? (
                  <>
                    <input
                      className="input py-1.5 text-sm font-medium"
                      value={cc.title}
                      placeholder="Clause title"
                      onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((c) => (c.id === id ? { ...c, title: e.target.value } : c)) }))}
                    />
                    <textarea
                      className="input text-sm leading-relaxed"
                      rows={7}
                      value={cc.text}
                      placeholder="Write the clause. A blank line starts a new paragraph; start a line with • for a bullet."
                      onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((c) => (c.id === id ? { ...c, text: e.target.value } : c)) }))}
                    />
                  </>
                ) : (
                  <>
                    <textarea
                      className="input text-sm leading-relaxed"
                      rows={9}
                      value={data.edits[id]?.text ?? standardBody(id, data)}
                      onChange={(e) => {
                        const text = e.target.value;
                        const standard = standardBody(id, data);
                        setEdit(id, (x) => ({ ...x, text: text === standard ? undefined : text }));
                      }}
                    />
                    {edited ? (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px]" style={{ color: "var(--warn-fg)" }}>
                          While edited, this clause no longer updates from the fields (days, amounts, clause numbers).
                        </p>
                        <button type="button" onClick={() => setEdit(id, (x) => ({ ...x, text: undefined }))} className="inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap text-[var(--muted)] hover:text-[var(--ink)]">
                          <RotateCcw size={11} /> Back to standard
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--muted-2)]">Standard wording — it follows the fields until you change it here.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={addCustom} className="btn-secondary w-full inline-flex items-center justify-center gap-1.5 py-2 text-sm">
        <Plus size={14} /> Add a clause
      </button>
      <p className="text-[11px] text-[var(--muted-2)]">New clauses go in just before “Entire Agreement”, which stays last.</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "info" | "warn" | "danger"; children: React.ReactNode }) {
  const style =
    tone === "warn"
      ? { background: "var(--warn-bg)", color: "var(--warn-fg)" }
      : tone === "danger"
        ? { background: "var(--danger-bg)", color: "var(--danger-fg)" }
        : { background: "var(--info-bg)", color: "var(--info-fg)" };
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={style}>
      {children}
    </span>
  );
}
