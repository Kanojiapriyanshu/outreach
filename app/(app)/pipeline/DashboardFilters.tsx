"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Star } from "lucide-react";
import { stageLabelText } from "@/app/components/Badge";

const STAGES = ["FIRST_EMAIL_SENT", "CREATOR_LIST_REQUESTED", "CREATOR_LIST_SENT", "NEGOTIATION", "CREATOR_SELECTED", "NOT_INTERESTED", "DEAL"];

/** Search + date-range + pipeline filters for the dashboard table — mirrors Gmail's own search
 * box (typed text filters as you pause typing), plus the filters that actually matter for this
 * business: which pipeline stage, whether the brand replied after the creator list went out, and
 * starred. All URL-driven so a filtered view is shareable/bookmarkable and survives a reload;
 * a page's own filters always reset back to page 1 since the result set just changed. */
export default function DashboardFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`/pipeline?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) pushParams({ q: q || null });
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const stage = searchParams.get("stage") ?? "";
  const starred = searchParams.get("starred") === "1";
  const repliedAfterList = searchParams.get("repliedAfterList") === "1";
  const hasFilters = !!(q || from || to || stage || starred || repliedAfterList);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
          <input
            className="input pl-9"
            placeholder="Search name, email, brand, or creator…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-[var(--muted-2)] whitespace-nowrap">Sent between</label>
          <input
            type="date"
            className="input w-auto"
            value={from}
            onChange={(e) => pushParams({ from: e.target.value || null })}
          />
          <span className="text-[var(--muted-2)] text-xs">–</span>
          <input type="date" className="input w-auto" value={to} onChange={(e) => pushParams({ to: e.target.value || null })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto py-1.5 text-xs" value={stage} onChange={(e) => pushParams({ stage: e.target.value || null })}>
          <option value="">Any pipeline stage</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {stageLabelText(s)}
            </option>
          ))}
        </select>

        <FilterToggle
          active={repliedAfterList}
          onClick={() => pushParams({ repliedAfterList: repliedAfterList ? null : "1" })}
          label="Replied after creator list"
        />

        <FilterToggle
          active={starred}
          onClick={() => pushParams({ starred: starred ? null : "1" })}
          label="Starred"
          icon={<Star size={12} fill={starred ? "currentColor" : "none"} />}
        />

        {hasFilters && (
          <button
            onClick={() => {
              setQ("");
              pushParams({ q: null, from: null, to: null, stage: null, starred: null, repliedAfterList: null });
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X size={13} /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
      style={
        active
          ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }
          : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
      }
    >
      {icon}
      {label}
    </button>
  );
}
