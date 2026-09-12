"use client";

import { useMemo, useState } from "react";
import { Search, Loader2, ChevronDown, ChevronUp } from "lucide-react";
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

const LANGUAGES = [
  { code: "", label: "Any language" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "id", label: "Indonesian" },
];

const FRESHNESS_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "30", label: "Posted in last 30 days" },
  { value: "90", label: "Posted in last 90 days" },
  { value: "180", label: "Posted in last 6 months" },
  { value: "365", label: "Posted in last year" },
];

const SORT_OPTIONS: { value: "relevance" | "viewCount" | "date"; label: string }[] = [
  { value: "relevance", label: "Most relevant" },
  { value: "viewCount", label: "Most total views" },
  { value: "date", label: "Newest channels" },
];

const RESULT_COUNTS = [10, 20, 30, 50];

const PLATFORM_OPTIONS: { key: string; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "twitter", label: "Twitter/X" },
  { key: "pinterest", label: "Pinterest" },
  { key: "facebook", label: "Facebook" },
  { key: "amazonStorefront", label: "Amazon storefront" },
];

const SEARCH_UNIT_COST = 100;

function estimateUnits(query: string, maxResults: number, hasComputedFilter: boolean): number {
  const phraseCount = Math.max(1, new Set(query.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)).size || 1);
  const cappedPhrases = Math.min(phraseCount, 3);
  const survivorCap = hasComputedFilter ? Math.min(maxResults * 2, 40) : maxResults;
  return cappedPhrases * SEARCH_UNIT_COST + 1 + survivorCap * 2;
}

export default function SearchTab() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [minSubscribers, setMinSubscribers] = useState("");
  const [maxSubscribers, setMaxSubscribers] = useState("");
  const [minAverageViews, setMinAverageViews] = useState("");
  const [maxAverageViews, setMaxAverageViews] = useState("");
  const [minEngagementRate, setMinEngagementRate] = useState("");
  const [postedWithinDays, setPostedWithinDays] = useState("");
  const [sortOrder, setSortOrder] = useState<"relevance" | "viewCount" | "date">("relevance");
  const [maxResults, setMaxResults] = useState(20);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const [unitsUsed, setUnitsUsed] = useState(0);

  const hasComputedFilter = !!(postedWithinDays || minAverageViews || maxAverageViews || minEngagementRate);
  const estimatedUnits = useMemo(() => estimateUnits(query, maxResults, hasComputedFilter), [query, maxResults, hasComputedFilter]);
  const phraseCount = useMemo(() => new Set(query.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)).size, [query]);

  function togglePlatform(key: string) {
    setPlatforms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

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
          language: language || undefined,
          minSubscribers: minSubscribers ? Number(minSubscribers) : undefined,
          maxSubscribers: maxSubscribers ? Number(maxSubscribers) : undefined,
          minAverageViews: minAverageViews ? Number(minAverageViews) : undefined,
          maxAverageViews: maxAverageViews ? Number(maxAverageViews) : undefined,
          minEngagementRate: minEngagementRate ? Number(minEngagementRate) : undefined,
          postedWithinDays: postedWithinDays ? Number(postedWithinDays) : undefined,
          platforms: platforms.length > 0 ? platforms : undefined,
          sortOrder,
          maxResults,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const niche = query
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ");
      setResults(data.results.map((r: CreatorCardData) => ({ ...r, niche })));
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
              placeholder="Niche or keywords — separate a few with commas, e.g. tech unboxing, gadget review, smartphone deals"
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
        {phraseCount > 1 && (
          <p className="text-[11px] text-[var(--muted-2)]">
            Searching {Math.min(phraseCount, 3)} keyword{Math.min(phraseCount, 3) > 1 ? "s" : ""} separately and merging the results
            {phraseCount > 3 ? " (only the first 3 are used)" : ""}.
          </p>
        )}

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

          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-teal-dark)] ml-auto"
          >
            {advancedOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Advanced filters
          </button>
        </div>

        {advancedOpen && (
          <div className="space-y-3 rounded-xl p-3 border border-[var(--border)]" style={{ background: "var(--bg)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-auto py-1.5 text-xs" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>

              <select className="input w-auto py-1.5 text-xs" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className="input w-32 py-1.5 text-xs"
                  placeholder="Min avg views"
                  value={minAverageViews}
                  onChange={(e) => setMinAverageViews(e.target.value)}
                />
                <span className="text-[var(--muted-2)] text-xs">–</span>
                <input
                  type="number"
                  className="input w-32 py-1.5 text-xs"
                  placeholder="Max avg views"
                  value={maxAverageViews}
                  onChange={(e) => setMaxAverageViews(e.target.value)}
                />
              </div>

              <input
                type="number"
                step="0.1"
                className="input w-36 py-1.5 text-xs"
                placeholder="Min engagement %"
                value={minEngagementRate}
                onChange={(e) => setMinEngagementRate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">
                Also active on (any of)
              </label>
              <div className="flex flex-wrap gap-1.5">
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
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          {error ? (
            <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
              {error}
            </p>
          ) : (
            <span />
          )}
          <span className="text-[11px] text-[var(--muted-2)]">~{estimatedUnits} API units for this search</span>
        </div>
      </div>

      {results !== null && (
        <>
          <div className="flex items-center justify-between text-xs text-[var(--muted-2)]">
            <span>
              {results.length} shown
              {candidateCount > results.length ? ` of ${candidateCount} matching filters` : ""} — loosen filters for more.
            </span>
            <span>{unitsUsed} API units used for this search</span>
          </div>

          {results.length === 0 ? (
            <div className="card p-10 text-center text-sm text-[var(--muted-2)]">
              Nothing matched those filters — try a broader keyword or looser ranges.
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
