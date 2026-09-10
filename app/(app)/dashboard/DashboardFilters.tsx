"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/** Search + date-range controls for the dashboard table — mirrors Gmail's own search box (typed
 * text filters as you pause typing) plus a "sent between these dates" range, driven entirely by
 * the URL so the filtered view is shareable/bookmarkable and survives a page reload. */
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
    router.push(`/dashboard?${params.toString()}`);
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
  const hasFilters = !!(q || from || to);

  return (
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
      {hasFilters && (
        <button
          onClick={() => {
            setQ("");
            pushParams({ q: null, from: null, to: null });
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <X size={13} /> Clear
        </button>
      )}
    </div>
  );
}
