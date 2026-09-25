"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, FileDown, FileDiff, History, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import ContractDocument from "@/app/components/contracts/ContractDocument";
import { buildContract, normalizeContract, type ContractData, type ContractFields } from "@/lib/contracts/template";
import { changeSummary, diffContracts } from "@/lib/contracts/diff";
import { analyzeContract, dealSummary, type Finding, type QuickFix } from "@/lib/contracts/analyze";
import DetailsPanel from "./DetailsPanel";
import ClausesPanel from "./ClausesPanel";
import CheckPanel from "./CheckPanel";

export interface ContractVersionView {
  id: string;
  label: string;
  createdAt: string;
  data: unknown;
}

type Tab = "details" | "clauses" | "check";
type SaveState = "saved" | "unsaved" | "saving" | "error";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  DRAFT: { label: "Draft", bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" },
  SENT: { label: "Sent to brand", bg: "var(--info-bg)", fg: "var(--info-fg)" },
  SIGNED: { label: "Signed", bg: "var(--success-bg)", fg: "var(--success-fg)" },
  VOID: { label: "Void", bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
};

const PAGE_WIDTH = 816; // 8.5in at 96dpi — the preview is scaled to fit its column.

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ContractEditor({
  id,
  initialTitle,
  initialStatus,
  initialData,
  initialVersions,
  aiAvailable,
}: {
  id: string;
  initialTitle: string;
  initialStatus: string;
  initialData: ContractData;
  initialVersions: ContractVersionView[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [data, setDataState] = useState<ContractData>(initialData);
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState(initialStatus);
  const [versions, setVersions] = useState(initialVersions);
  const [tab, setTab] = useState<Tab>("details");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [compare, setCompare] = useState<string>(() => initialVersions.find((v) => v.label === "Sent to brand")?.id ?? "standard");
  const [menu, setMenu] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dirty = useRef(false);
  const saving = useRef<Promise<boolean> | null>(null);
  // The latest data for saveNow, which can run from a timer or a click after the render that changed it.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const setData = useCallback((change: (d: ContractData) => ContractData) => {
    dirty.current = true;
    setSaveState("unsaved");
    setDataState(change);
  }, []);
  const updateFields = useCallback((patch: Partial<ContractFields>) => setData((d) => ({ ...d, fields: { ...d.fields, ...patch } })), [setData]);

  // --- derived document ------------------------------------------------------------------
  const built = useMemo(() => buildContract(data), [data]);
  const findings = useMemo(() => analyzeContract(data, built), [data, built]);
  const deal = useMemo(() => dealSummary(data.fields), [data.fields]);
  const compareVersion = versions.find((v) => v.id === compare) ?? null;
  const diff = useMemo(() => {
    if (compare === "off") return null;
    if (compare === "standard") return diffContracts(buildContract({ ...data, edits: {}, custom: [] }), built);
    return compareVersion ? diffContracts(buildContract(normalizeContract(compareVersion.data)), built) : null;
  }, [compare, compareVersion, data, built]);
  const changes = useMemo(() => (diff ? changeSummary(diff) : []), [diff]);
  const blockers = findings.filter((f) => f.severity === "blocker").length;

  // --- saving ----------------------------------------------------------------------------
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (saving.current) await saving.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving");
    const run = (async () => {
      try {
        const res = await fetch(`/api/contracts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, data: dataRef.current }) });
        if (!res.ok) throw new Error();
        setSaveState(dirty.current ? "unsaved" : "saved");
        return true;
      } catch {
        dirty.current = true;
        setSaveState("error");
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = run;
    return run;
  }, [id, title]);

  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => void saveNow(), 900);
    return () => clearTimeout(timer);
  }, [data, title, saveNow]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // --- preview scaling -------------------------------------------------------------------
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setZoom(Math.min(1, Math.max(0.45, (entry.contentRect.width - 24) / PAGE_WIDTH))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- actions ---------------------------------------------------------------------------
  function show(sectionId: string) {
    document.getElementById(`contract-section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goTo(f: Finding) {
    if (f.sectionId) show(f.sectionId);
    if (f.field) {
      setTab("details");
      setTimeout(() => {
        const el = document.getElementById(`field-${f.field}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLElement | null)?.focus?.();
      }, 60);
    }
  }

  function applyFix(fix: QuickFix) {
    if (fix.fields) updateFields(fix.fields);
    if (fix.restoreClause) {
      const clauseId = fix.restoreClause;
      setData((d) => {
        const edits = { ...d.edits };
        const rest = { ...edits[clauseId], removed: false };
        if (rest.text === undefined) delete edits[clauseId];
        else edits[clauseId] = rest;
        return { ...d, edits };
      });
    }
  }

  async function exportPdf(redline: boolean) {
    if (!redline && blockers > 0 && !confirm(`${blockers} thing${blockers === 1 ? "" : "s"} to fix before sending (see Deal check). Export the clean copy anyway?`)) return;
    // Open the tab straight away (a popup opened after an await gets blocked), then point it at the PDF.
    const tabRef = window.open("about:blank", "_blank");
    const ok = await saveNow();
    const url = `/contract-pdf/${id}${redline && compare !== "off" ? `?compare=${encodeURIComponent(compare)}` : ""}`;
    if (!ok) {
      tabRef?.close();
      alert("Couldn't save the latest changes, so the PDF would be out of date. Try again.");
      return;
    }
    if (tabRef) tabRef.location.href = url;
    else router.push(url);
  }

  async function setContractStatus(next: string) {
    if (next === status) return;
    if (!(await saveNow())) return;
    const res = await fetch(`/api/contracts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (!res.ok) return;
    const body = await res.json();
    setStatus(body.status);
    if (body.version) {
      setVersions((v) => [{ ...body.version, createdAt: body.version.createdAt }, ...v]);
      // From here on, show what changed since the brand saw it.
      if (next === "SENT") setCompare(body.version.id);
    }
  }

  async function saveVersion() {
    const label = prompt("Name this version", `Draft ${versions.length + 1}`);
    if (label === null) return;
    if (!(await saveNow())) return;
    const res = await fetch(`/api/contracts/${id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    if (res.ok) {
      const body = await res.json();
      setVersions((v) => [body.version, ...v]);
    }
  }

  async function duplicate() {
    await saveNow();
    const res = await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId: id }) });
    if (res.ok) router.push(`/contracts/${(await res.json()).id}`);
  }

  async function remove() {
    if (!confirm("Delete this contract and all its versions? This can't be undone.")) return;
    await fetch(`/api/contracts/${id}`, { method: "DELETE" });
    dirty.current = false;
    router.push("/contracts");
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "details", label: "Details" },
    { key: "clauses", label: "Clauses", badge: built.sections.filter((s) => s.edited).length + built.removed.length || undefined },
    { key: "check", label: "Deal check", badge: blockers || undefined },
  ];

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/contracts" className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)]" aria-label="All contracts">
          <ArrowLeft size={16} />
        </Link>
        <input
          className="flex-1 min-w-[200px] bg-transparent text-[19px] font-semibold tracking-tight text-[var(--ink)] outline-none border-b border-transparent focus:border-[var(--border)]"
          value={title}
          onChange={(e) => {
            dirty.current = true;
            setSaveState("unsaved");
            setTitle(e.target.value);
          }}
          aria-label="Contract name"
        />
        <span className="text-xs text-[var(--muted-2)] w-16 text-right">
          {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved" : saveState === "error" ? <span style={{ color: "var(--danger-fg)" }}>Not saved</span> : "Saved"}
        </span>
        <select
          className="input py-1.5 text-xs font-semibold"
          style={{ width: "auto", background: STATUS[status]?.bg, color: STATUS[status]?.fg }}
          value={status}
          onChange={(e) => void setContractStatus(e.target.value)}
          aria-label="Status"
        >
          {Object.entries(STATUS).map(([key, s]) => (
            <option key={key} value={key}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void exportPdf(false)} className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs">
          <FileDown size={14} /> Export PDF
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} className="btn-secondary px-2 py-2" aria-label="More">
            <MoreHorizontal size={14} />
          </button>
          {menu && (
            <div className="absolute right-0 z-30 mt-1 w-56 card py-1 shadow-lg text-sm" style={{ boxShadow: "var(--shadow-card)" }} onMouseLeave={() => setMenu(false)}>
              <MenuItem icon={FileDiff} disabled={compare === "off"} onClick={() => void exportPdf(true)}>
                Export redline PDF
              </MenuItem>
              <MenuItem icon={History} onClick={() => void saveVersion()}>
                Save a version
              </MenuItem>
              <MenuItem icon={Copy} onClick={() => void duplicate()}>
                Duplicate for a new deal
              </MenuItem>
              <MenuItem icon={Trash2} danger onClick={() => void remove()}>
                Delete contract
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] gap-4 items-start">
        {/* Left: fields, clauses, deal check */}
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto pr-1 space-y-3">
          <div className="flex gap-1 p-1 rounded-full w-fit" style={{ background: "var(--neutral-bg)" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="px-3.5 py-1.5 text-sm font-medium rounded-full inline-flex items-center gap-1.5"
                style={{
                  background: tab === t.key ? "var(--surface)" : "transparent",
                  color: tab === t.key ? "var(--ink)" : "var(--muted)",
                  boxShadow: tab === t.key ? "var(--shadow-card)" : "none",
                }}
              >
                {t.label}
                {t.badge ? (
                  <span className="text-[10px] font-bold px-1.5 rounded-full" style={t.key === "check" ? { background: "var(--danger-bg)", color: "var(--danger-fg)" } : { background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
                    {t.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {tab === "details" && <DetailsPanel fields={data.fields} update={updateFields} />}
          {tab === "clauses" && <ClausesPanel data={data} built={built} setData={setData} onShow={show} />}
          {tab === "check" && (
            <CheckPanel fields={data.fields} findings={findings} deal={deal} aiAvailable={aiAvailable} onFix={applyFix} onGoTo={goTo} saveNow={saveNow} contractId={id} />
          )}
        </div>

        {/* Right: the contract itself */}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--muted)]">Show changes vs</span>
            <select className="input py-1 text-xs" style={{ width: "auto" }} value={compare} onChange={(e) => setCompare(e.target.value)} aria-label="Compare against">
              <option value="standard">Your standard agreement</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} · {when(v.createdAt)}
                </option>
              ))}
              <option value="off">Nothing (clean copy)</option>
            </select>
            {diff && (
              <div className="flex flex-wrap gap-1">
                {changes.length === 0 ? (
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--success-fg)" }}>
                    <Check size={12} /> {compare === "standard" ? "Matches your standard wording" : "No changes since this version"}
                  </span>
                ) : (
                  changes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => show(c.id)}
                      className="px-2 py-0.5 rounded-full font-medium"
                      style={
                        c.status === "removed"
                          ? { background: "var(--danger-bg)", color: "var(--danger-fg)" }
                          : c.status === "added"
                            ? { background: "var(--success-bg)", color: "var(--success-fg)" }
                            : { background: "var(--warn-bg)", color: "var(--warn-fg)" }
                      }
                      title={`${c.edits} change${c.edits === 1 ? "" : "s"}`}
                    >
                      {c.label}
                      {c.status === "removed" ? " (removed)" : c.status === "added" ? " (new)" : ""}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div ref={previewRef} className="rounded-xl p-3 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto" style={{ background: "var(--neutral-bg)" }}>
            <div style={{ width: PAGE_WIDTH, zoom }} className="mx-auto shadow-md">
              <ContractDocument built={built} diff={diff} />
            </div>
          </div>
          {saveState === "saving" && (
            <p className="text-[11px] text-[var(--muted-2)] flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Saving…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, onClick, children, disabled, danger }: { icon: typeof Copy; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg)] disabled:opacity-40" style={danger ? { color: "var(--danger-fg)" } : undefined}>
      <Icon size={14} /> {children}
    </button>
  );
}
