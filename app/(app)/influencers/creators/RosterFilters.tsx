"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { ROSTER_PLATFORMS, ROSTER_SORTS, ROSTER_STATUSES, type RosterFilters as Filters } from "@/lib/creatorRoster";

/** Search and filters for the Creators roster — URL-driven, so a filtered view survives a reload. */
export default function RosterFilters({ filters }: { filters: Filters }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`/influencers/creators?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q.trim() !== (searchParams.get("q") ?? "")) push({ q: q.trim() });
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = !!(filters.q || filters.email || filters.platform || filters.status || filters.sort !== "recent");

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[220px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
        <input className="input pl-9" placeholder="Search name, email, niche or content…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <select className="input py-2 text-xs" style={{ width: "auto" }} value={filters.email} onChange={(e) => push({ email: e.target.value })} aria-label="Email">
          <option value="">Any email status</option>
          <option value="has">Has an email</option>
          <option value="missing">No email yet</option>
        </select>
        <select className="input py-2 text-xs" style={{ width: "auto" }} value={filters.platform} onChange={(e) => push({ platform: e.target.value })} aria-label="Platform">
          <option value="">Any platform</option>
          {ROSTER_PLATFORMS.map((p) => (
            <option key={p.key} value={p.key}>
              On {p.label}
            </option>
          ))}
        </select>
        <select className="input py-2 text-xs" style={{ width: "auto" }} value={filters.status} onChange={(e) => push({ status: e.target.value })} aria-label="Outreach">
          {ROSTER_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="input py-2 text-xs" style={{ width: "auto" }} value={filters.sort} onChange={(e) => push({ sort: e.target.value === "recent" ? "" : e.target.value })} aria-label="Sort">
          {ROSTER_SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setQ("");
              router.push("/influencers/creators");
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] px-1"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
