"use client";

import { useMemo, useState } from "react";
import { Search, Loader2, ChevronDown, ChevronUp, Download, Sparkles } from "lucide-react";
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

/** How YouTube hands back the raw hits, before any of this app's own scoring exists. */
const SEARCH_ORDER_OPTIONS: { value: "relevance" | "viewCount" | "date"; label: string }[] = [
  { value: "relevance", label: "YouTube relevance" },
  { value: "viewCount", label: "Most total views" },
  { value: "date", label: "Newest channels" },
];

/** How the final, fully-scored results are ranked — the one the user actually reasons about. */
const SORT_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "relevance", label: "Best match" },
  { value: "quality", label: "Highest quality" },
  { value: "subscribers", label: "Most subscribers" },
  { value: "engagement", label: "Highest engagement" },
  { value: "avgViews", label: "Most avg views" },
  { value: "recentUpload", label: "Most recently active" },
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

/** Mirrors SUBSCRIBER_TIERS in lib/youtube/creatorSignals.ts — the server re-validates every key,
 * so a drift here narrows the UI rather than corrupting a search. */
const TIER_OPTIONS: { key: string; label: string }[] = [
  { key: "nano", label: "Nano 1K–10K" },
  { key: "micro", label: "Micro 10K–100K" },
  { key: "mid", label: "Mid 100K–500K" },
  { key: "macro", label: "Macro 500K–1M" },
  { key: "mega", label: "Mega 1M+" },
];

/** The categories the audience-benchmark engine can resolve a creator to. */
const CATEGORY_OPTIONS = [
  "technology",
  "gaming",
  "beauty",
  "fashion",
  "finance",
  "business",
  "food",
  "travel",
  "fitness",
  "health",
  "parenting",
  "automotive",
  "sports",
  "music",
  "comedy",
  "entertainment",
  "education",
  "news",
  "pets",
  "diy",
  "lifestyle",
  "vlogging",
  "podcast",
  "review",
  "unboxing",
  "tutorial",
];

const SEARCH_UNIT_COST = 100;
const MAX_PHRASES = 5;

function estimateUnits(query: string, maxResults: number, hasComputedFilter: boolean, expand: boolean): number {
  const typed = new Set(query.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)).size || 1;
  const base = Math.min(typed, MAX_PHRASES);
  const phrases = expand ? Math.min(MAX_PHRASES, base + Math.max(0, MAX_PHRASES - base)) : base;
  const survivorCap = hasComputedFilter ? Math.min(maxResults * 2, 40) : maxResults;
  const lookupCalls = Math.ceil(Math.min(phrases * 50, 150) / 50);
  return phrases * SEARCH_UNIT_COST + lookupCalls + survivorCap * 2;
}

const CSV_COLUMNS: { header: string; value: (c: CreatorCardData) => string | number }[] = [
  { header: "Channel", value: (c) => c.title },
  { header: "Channel URL", value: (c) => c.channelUrl },
  { header: "Email", value: (c) => c.email ?? "" },
  { header: "Country", value: (c) => c.country },
  { header: "Category", value: (c) => c.category ?? "" },
  { header: "Size tier", value: (c) => c.sizeTier ?? "" },
  { header: "Subscribers", value: (c) => c.subscriberCount },
  { header: "Avg views", value: (c) => c.averageViews },
  { header: "Median views", value: (c) => c.medianViews ?? "" },
  { header: "Engagement %", value: (c) => c.engagementRate.toFixed(2) },
  { header: "Match score", value: (c) => c.relevanceScore ?? "" },
  { header: "Quality score", value: (c) => c.qualityScore ?? "" },
  { header: "Brand safety", value: (c) => c.brandSafetyLabel ?? "" },
  { header: "Sponsored %", value: (c) => c.sponsorshipFrequencyPercent ?? "" },
  { header: "Uploads / 90d", value: (c) => c.uploadsLast90Days ?? "" },
  { header: "Last upload", value: (c) => c.lastUploadAt ?? "" },
  { header: "Matched terms", value: (c) => (c.matchedTerms ?? []).join(" | ") },
];

/** Quotes every field rather than only the ones that need it — a creator's title containing a
 * comma or a stray quote is the normal case here, not the exception. */
function toCsv(rows: CreatorCardData[]): string {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = CSV_COLUMNS.map((c) => escape(c.header)).join(",");
  const body = rows.map((row) => CSV_COLUMNS.map((c) => escape(c.value(row))).join(",")).join("\n");
  return `${header}\n${body}`;
}

export default function SearchTab() {
  const [query, setQuery] = useState("");
  const [expandKeywords, setExpandKeywords] = useState(false);
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [minSubscribers, setMinSubscribers] = useState("");
  const [maxSubscribers, setMaxSubscribers] = useState("");
  const [subscriberTiers, setSubscriberTiers] = useState<string[]>([]);
  const [minAverageViews, setMinAverageViews] = useState("");
  const [maxAverageViews, setMaxAverageViews] = useState("");
  const [minEngagementRate, setMinEngagementRate] = useState("");
  const [postedWithinDays, setPostedWithinDays] = useState("");
  const [sortOrder, setSortOrder] = useState<"relevance" | "viewCount" | "date">("relevance");
  const [sortBy, setSortBy] = useState("relevance");
  const [maxResults, setMaxResults] = useState(20);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [hasEmail, setHasEmail] = useState(false);
  const [excludeBrandChannels, setExcludeBrandChannels] = useState(true);
  const [minBrandSafety, setMinBrandSafety] = useState("");
  const [minSponsorshipFrequency, setMinSponsorshipFrequency] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CreatorCardData[] | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const [searchedPhrases, setSearchedPhrases] = useState<string[]>([]);
  const [unitsUsed, setUnitsUsed] = useState(0);

  const hasComputedFilter = !!(
    postedWithinDays ||
    minAverageViews ||
    maxAverageViews ||
    minEngagementRate ||
    minBrandSafety ||
    minSponsorshipFrequency ||
    categories.length > 0
  );
  const estimatedUnits = useMemo(
    () => estimateUnits(query, maxResults, hasComputedFilter, expandKeywords),
    [query, maxResults, hasComputedFilter, expandKeywords]
  );

  function toggle(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter((p) => p !== key) : [...list, key]);
  }

  function downloadCsv() {
    if (!results || results.length === 0) return;
    const blob = new Blob([toCsv(results)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "creators";
    link.href = url;
    link.download = `discovery-${slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
          expandKeywords,
          country: country || undefined,
          language: language || undefined,
          minSubscribers: minSubscribers ? Number(minSubscribers) : undefined,
          maxSubscribers: maxSubscribers ? Number(maxSubscribers) : undefined,
          subscriberTiers: subscriberTiers.length > 0 ? subscriberTiers : undefined,
          minAverageViews: minAverageViews ? Number(minAverageViews) : undefined,
          maxAverageViews: maxAverageViews ? Number(maxAverageViews) : undefined,
          minEngagementRate: minEngagementRate ? Number(minEngagementRate) : undefined,
          postedWithinDays: postedWithinDays ? Number(postedWithinDays) : undefined,
          platforms: platforms.length > 0 ? platforms : undefined,
          categories: categories.length > 0 ? categories : undefined,
          hasEmail,
          excludeBrandChannels,
          minBrandSafety: minBrandSafety ? Number(minBrandSafety) : undefined,
          minSponsorshipFrequency: minSponsorshipFrequency ? Number(minSponsorshipFrequency) : undefined,
          sortOrder,
          sortBy,
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
      setSearchedPhrases(data.searchedPhrases ?? []);
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

        <label className="flex items-center gap-2 text-[11.5px] text-[var(--muted)] cursor-pointer w-fit">
          <input type="checkbox" checked={expandKeywords} onChange={(e) => setExpandKeywords(e.target.checked)} />
          <Sparkles size={12} style={{ color: "var(--brand-teal-dark)" }} />
          Also search &ldquo;review&rdquo;, &ldquo;unboxing&rdquo; and &ldquo;best …&rdquo; variants
          <span className="text-[var(--muted-2)]">(wider net, +100 units per added phrase)</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5 text-xs" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>

          <select className="input w-auto py-1.5 text-xs" value={postedWithinDays} onChange={(e) => setPostedWithinDays(e.target.value)}>
            {FRESHNESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select className="input w-auto py-1.5 text-xs" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
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

        <div>
          <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">Audience size</label>
          <div className="flex flex-wrap gap-1.5">
            {TIER_OPTIONS.map((t) => {
              const active = subscriberTiers.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggle(subscriberTiers, setSubscriberTiers, t.key)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                  style={
                    active
                      ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }
                      : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
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
                {SEARCH_ORDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Fetch by: {o.label}
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

              <input
                type="number"
                className="input w-40 py-1.5 text-xs"
                placeholder="Min brand safety (0-100)"
                value={minBrandSafety}
                onChange={(e) => setMinBrandSafety(e.target.value)}
              />

              <input
                type="number"
                className="input w-44 py-1.5 text-xs"
                placeholder="Min % sponsored uploads"
                value={minSponsorshipFrequency}
                onChange={(e) => setMinSponsorshipFrequency(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)] cursor-pointer">
                <input type="checkbox" checked={hasEmail} onChange={(e) => setHasEmail(e.target.checked)} />
                Only creators with a public email
              </label>
              <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)] cursor-pointer">
                <input type="checkbox" checked={excludeBrandChannels} onChange={(e) => setExcludeBrandChannels(e.target.checked)} />
                Exclude brand &amp; news channels
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">Also active on (any of)</label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORM_OPTIONS.map((p) => {
                  const active = platforms.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => toggle(platforms, setPlatforms, p.key)}
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

            <div>
              <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">
                Content category (any of)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((c) => {
                  const active = categories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggle(categories, setCategories, c)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition-colors"
                      style={
                        active
                          ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }
                          : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
                      }
                    >
                      {c}
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
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-[var(--muted-2)]">
            <span>
              {results.length} shown
              {candidateCount > results.length ? ` of ${candidateCount} matching filters` : ""} — loosen filters for more.
              {searchedPhrases.length > 1 && <> Searched: {searchedPhrases.map((p) => `“${p}”`).join(", ")}.</>}
            </span>
            <div className="flex items-center gap-3">
              {results.length > 0 && (
                <button onClick={downloadCsv} className="inline-flex items-center gap-1 font-medium text-[var(--brand-teal-dark)]">
                  <Download size={12} /> Export CSV
                </button>
              )}
              <span>{unitsUsed} API units used</span>
            </div>
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
