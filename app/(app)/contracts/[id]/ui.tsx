"use client";

import { useEffect, useRef, useState } from "react";

/** Small shared form pieces for the contract editor, in the app's own input styles. */

export function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] p-3.5 space-y-3" style={{ background: "var(--surface)" }}>
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--ink)]">{title}</h3>
        {hint && <p className="text-[11px] text-[var(--muted-2)] mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Label({ htmlFor, label, hint, children }: { htmlFor?: string; label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="block min-w-0 flex-1">
      <label htmlFor={htmlFor} className="block text-[11px] font-medium text-[var(--muted)] mb-1">
        {label}
      </label>
      {children}
      {hint && <div className="text-[11px] text-[var(--muted-2)] mt-1">{hint}</div>}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  list,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  list?: string;
}) {
  return <input id={id} type={type} list={list} className="input py-1.5 text-sm" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

/** A number field that lets the box be cleared while typing, and reports null when empty. */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  placeholder,
  allowEmpty,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === null ? "" : String(value));
    }
  }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        inputMode="decimal"
        className="input py-1.5 text-sm"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const raw = e.target.value.replace(/[,$\s]/g, "");
          if (raw === "") {
            if (allowEmpty) {
              last.current = null;
              onChange(null);
            }
            return;
          }
          let n = Number(raw);
          if (!Number.isFinite(n)) return;
          if (min !== undefined) n = Math.max(min, n);
          if (max !== undefined) n = Math.min(max, n);
          if (step === 1) n = Math.round(n);
          last.current = n;
          onChange(n);
        }}
      />
      {suffix && <span className="text-xs text-[var(--muted)] whitespace-nowrap">{suffix}</span>}
    </div>
  );
}

export function Choice<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div id={id} className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="px-2.5 py-1 rounded-full text-xs font-medium border"
          style={
            value === o.value
              ? { background: "var(--brand-teal-dark)", color: "var(--surface)", borderColor: "var(--brand-teal-dark)" }
              : { borderColor: "var(--border)", color: "var(--muted)" }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm text-[var(--ink)] cursor-pointer">
      <input id={id} type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Debounced search box with a dropdown of suggestions. */
export function Suggest<T>({
  placeholder,
  fetchResults,
  render,
  onPick,
}: {
  placeholder: string;
  fetchResults: (q: string) => Promise<T[]>;
  render: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen] = useState(false);

  const active = q.trim().length >= 2;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchResults(q.trim())
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // fetchResults is a stable inline function per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, active]);
  const shown = active ? results : [];

  return (
    <div className="relative">
      <input
        className="input py-1.5 text-sm"
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && shown.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 card max-h-64 overflow-y-auto py-1 shadow-lg" style={{ boxShadow: "var(--shadow-card)" }}>
          {shown.map((item, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg)]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(item);
                setQ("");
                setResults([]);
                setOpen(false);
              }}
            >
              {render(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
