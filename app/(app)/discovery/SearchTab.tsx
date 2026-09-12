"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import CreatorCard, { type CreatorCardData } from "./CreatorCard";

const COUNTRIES = [
  { code: "", label: "Any country" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "PH", label: "Philippines" },
  { code: "ID", label: "Indonesia" },
  { code: "NG", label: "Nigeria" },
  { code: "ZA", label: "South Africa" },
];

const FRESHNESS_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "30", label: "Posted in last 30 days" },
  { value: "90", label: "Posted in last 90 days" },
  { value: "180", label: "Posted in last 6 months" },
  { value: "365", label: "Posted in last year" },
];

const RESULT_COUNTS = [10, 20, 30, 50];

export default function SearchTab() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [minSubscribers, setMinSubscribers] = useState("");
  const [maxSubscribers, setMaxSubscribers] = useState("");
  const [postedWithinDays, setPostedWithinDays] = useState("");
  const [maxResults, setMaxResults] = useState(20);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const [unitsUsed, setUnitsUsed] = useState(0);

  async function search() {
    if (!query.trim()) {
      setError("Enter a niche or keyword to search for");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/discovery/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          country: country || undefined,
          minSubscribers: minSubscribers ? Number(minSubscribers) : undefined,
          maxSubscribers: maxSubscribers ? Number(maxSubscribers) : undefined,
          postedWithinDays: postedWithinDays ? Number(postedWithinDays) : undefined,
          maxResults,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(
        data.results.map((r: CreatorCardData) => ({ ...r, niche: query }))
      );
      setCandidateCount(data.candidateCount);
      setUnitsUsed(data.unitsUsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
            <input
              className="input pl-9"
              placeholder="Niche or keyword — e.g. tech unboxing, skincare routines, home workouts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
            />
          </div>
          <button onClick={() => void search()} disabled={loading} className="btn-primary inline-flex items-center gap-1.5 px-5 py-2 text-sm disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5 text-xs" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              className="input w-28 py-1.5 text-xs"
              placeholder="Min subs"
              value={minSubscribers}
              onChange={(e) => setMinSubscribers(e.target.value)}
            />
            <span className="text-[var(--muted-2)] text-xs">–</span>
            <input
              type="number"
              className="input w-28 py-1.5 text-xs"
              placeholder="Max subs"
              value={maxSubscribers}
              onChange={(e) => setMaxSubscribers(e.target.value)}
            />
          </div>

          <select className="input w-auto py-1.5 text-xs" value={postedWithinDays} onChange={(e) => setPostedWithinDays(e.target.value)}>
            {FRESHNESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select className="input w-auto py-1.5 text-xs" value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))}>
            {RESULT_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} results
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
            {error}
          </p>
        )}
      </div>

      {results !== null && (
        <>
          <div className="flex items-center justify-between text-xs text-[var(--muted-2)]">
            <span>
              {results.length} shown
              {candidateCount > results.length ? ` of ${candidateCount} matching the subscriber range` : ""} — try loosening filters
              for more.
            </span>
            <span>{unitsUsed} API units used for this search</span>
          </div>

          {results.length === 0 ? (
            <div className="card p-10 text-center text-sm text-[var(--muted-2)]">
              Nothing matched those filters — try a broader keyword or a wider subscriber range.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((c) => (
                <CreatorCard key={c.channelId} creator={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
