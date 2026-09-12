"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

const PLATFORM_OPTIONS: { key: string; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "twitter", label: "Twitter/X" },
  { key: "pinterest", label: "Pinterest" },
  { key: "facebook", label: "Facebook" },
  { key: "amazonStorefront", label: "Amazon storefront" },
];

/** Search + subscriber/views/engagement-range + platform-presence filters for the Library tab —
 * same debounced-search / URL-driven pattern as Pipeline's DashboardFilters.tsx, so a filtered
 * Library view is shareable and survives a reload the same way. */
export default function LibraryFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "library");
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`/discovery?${params.toString()}`);
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

  const country = searchParams.get("country") ?? "";
  const minSubscribers = searchParams.get("minSubscribers") ?? "";
  const maxSubscribers = searchParams.get("maxSubscribers") ?? "";
  const minAverageViews = searchParams.get("minAverageViews") ?? "";
  const maxAverageViews = searchParams.get("maxAverageViews") ?? "";
  const minEngagementRate = searchParams.get("minEngagementRate") ?? "";
  const platforms = (searchParams.get("platforms") ?? "").split(",").filter(Boolean);
  const hasFilters = !!(q || country || minSubscribers || maxSubscribers || minAverageViews || maxAverageViews || minEngagementRate || platforms.length);

  function togglePlatform(key: string) {
    const next = platforms.includes(key) ? platforms.filter((p) => p !== key) : [...platforms, key];
    pushParams({ platforms: next.length > 0 ? next.join(",") : null });
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
          <input className="input pl-9" placeholder="Search name or niche…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <input
          className="input w-24"
          placeholder="Country"
          maxLength={2}
          value={country}
          onChange={(e) => pushParams({ country: e.target.value.toUpperCase() || null })}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            className="input w-28"
            placeholder="Min subs"
            value={minSubscribers}
            onChange={(e) => pushParams({ minSubscribers: e.target.value || null })}
          />
          <span className="text-[var(--muted-2)] text-xs">–</span>
          <input
            type="number"
            className="input w-28"
            placeholder="Max subs"
            value={maxSubscribers}
            onChange={(e) => pushParams({ maxSubscribers: e.target.value || null })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            className="input w-32 py-1.5 text-xs"
            placeholder="Min avg views"
            value={minAverageViews}
            onChange={(e) => pushParams({ minAverageViews: e.target.value || null })}
          />
          <span className="text-[var(--muted-2)] text-xs">–</span>
          <input
            type="number"
            className="input w-32 py-1.5 text-xs"
            placeholder="Max avg views"
            value={maxAverageViews}
            onChange={(e) => pushParams({ maxAverageViews: e.target.value || null })}
          />
        </div>
        <input
          type="number"
          step="0.1"
          className="input w-36 py-1.5 text-xs"
          placeholder="Min engagement %"
          value={minEngagementRate}
          onChange={(e) => pushParams({ minEngagementRate: e.target.value || null })}
        />

        {PLATFORM_OPTIONS.map((p) => {
          const active = platforms.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => togglePlatform(p.key)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={
                active
                  ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }
                  : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
              }
            >
              {p.label}
            </button>
          );
        })}

        {hasFilters && (
          <button
            onClick={() => {
              setQ("");
              pushParams({
                q: null,
                country: null,
                minSubscribers: null,
                maxSubscribers: null,
                minAverageViews: null,
                maxAverageViews: null,
                minEngagementRate: null,
                platforms: null,
              });
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] ml-auto"
          >
            <X size={13} /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
