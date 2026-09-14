"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Loader2,
  Wand2,
  X,
  Play,
  Download,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { buildKeywordMatrix, type CampaignProfile, type ContentFormat } from "@/lib/discovery/campaignProfile";
import type { CampaignProgressEvent, CampaignRunResult, DiscoveryDepth } from "@/lib/discovery/campaignDiscovery";
import type { CreatorTier, QualifiedCreator, ScoreBreakdown } from "@/lib/discovery/creatorQualifier";
import StartOutreachButton from "./StartOutreachButton";
import MediaKitButton from "./MediaKitButton";

const MARKETS = [
  { code: "", label: "Any market" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "JP", label: "Japan" },
  { code: "PH", label: "Philippines" },
  { code: "ID", label: "Indonesia" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "UAE" },
  { code: "NG", label: "Nigeria" },
  { code: "ZA", label: "South Africa" },
  { code: "PK", label: "Pakistan" },
];

const CONTENT_OPTIONS: ContentFormat[] = [
  "review",
  "unboxing",
  "test",
  "setup",
  "installation",
  "first look",
  "hands on",
  "comparison",
  "demo",
  "buying guide",
  "long term review",
  "worth it",
  "tutorial",
];

const TIERS: { tier: CreatorTier; label: string; hint: string }[] = [
  { tier: "A", label: "A · Excellent", hint: "Repeatedly covers the category and regularly reviews products" },
  { tier: "B", label: "B · Strong", hint: "Meaningful relevant content, not their dominant focus" },
  { tier: "C", label: "C · Possible", hint: "Occasionally covers the category" },
  { tier: "D", label: "D · Poor / rejected", hint: "Keyword match without enough relevant content" },
];

const SCORE_PARTS: { key: Exclude<keyof ScoreBreakdown, "total">; label: string; max: number }[] = [
  { key: "contentRelevance", label: "Content relevance", max: 35 },
  { key: "reviewBehavior", label: "Review / unboxing behavior", max: 20 },
  { key: "productSimilarity", label: "Product similarity", max: 15 },
  { key: "marketFit", label: "Audience / market fit", max: 10 },
  { key: "consistency", label: "Channel consistency", max: 10 },
  { key: "engagement", label: "Engagement", max: 10 },
];

const BRIEF_EXAMPLE =
  "Find US YouTube creators with 10K–50K subscribers who create treadmill, walking pad, home gym, fitness equipment, unboxing, testing, and review videos.";

interface DepthOption {
  key: DiscoveryDepth;
  label: string;
  maxQueries: number;
  analyzeLimit: number;
  estimatedUnits: number;
}

type StreamEvent = CampaignProgressEvent | { type: "result"; result: CampaignRunResult } | { type: "error"; message: string };
type ProgressEvent = Extract<CampaignProgressEvent, { type: "progress" }>;

function compact(n: number | null): string {
  if (n === null) return "Not available";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function shortDate(iso: string | null): string {
  if (!iso) return "Date not available";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function csvCell(value: string | number | null): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function CampaignTab() {
  const [brief, setBrief] = useState("");
  const [parsing, setParsing] = useState(false);
  const [profile, setProfile] = useState<CampaignProfile | null>(null);
  const [parseSource, setParseSource] = useState<"ai" | "rules" | null>(null);
  const [parseNotes, setParseNotes] = useState<string[]>([]);
  const [depths, setDepths] = useState<DepthOption[]>([]);
  const [depth, setDepth] = useState<DiscoveryDepth>("standard");

  const [running, setRunning] = useState(false);
  const [stageMessage, setStageMessage] = useState("");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<CampaignRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleTiers, setVisibleTiers] = useState<CreatorTier[]>(["A", "B"]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const keywordPreview = useMemo(() => (profile ? buildKeywordMatrix(profile).map((q) => q.query) : []), [profile]);
  const selectedDepth = depths.find((d) => d.key === depth);

  const shown = useMemo(() => {
    if (!result || !profile) return [];
    return result.creators.filter((c) => visibleTiers.includes(c.tier)).slice(0, profile.creatorCount);
  }, [result, visibleTiers, profile]);

  function patch(update: Partial<CampaignProfile>) {
    setProfile((prev) => (prev ? { ...prev, ...update } : prev));
  }

  async function buildProfile() {
    if (!brief.trim()) {
      setError("Describe the campaign first");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/discovery/campaign/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that brief");
      setProfile(data.profile);
      setParseSource(data.source);
      setParseNotes(data.notes ?? []);
      setDepths(data.depths ?? []);
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that brief");
    } finally {
      setParsing(false);
    }
  }

  async function runDiscovery() {
    if (!profile) return;
    if (profile.targetProducts.length === 0) {
      setError("Add at least one target product");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setExpanded(null);
    setStageMessage("Starting…");
    try {
      const res = await fetch("/api/discovery/campaign/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, depth }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Discovery couldn't start");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "stage") setStageMessage(event.message);
          else if (event.type === "progress") setProgress(event);
          else if (event.type === "result") setResult(event.result);
          else if (event.type === "error") throw new Error(event.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  function downloadCsv() {
    if (shown.length === 0) return;
    const header = [
      "Rank", "Creator", "Channel URL", "Subscribers", "Declared country", "Tier", "Relevance score", "Relevant videos",
      "Analyzed videos", "Main content", "Products reviewed", "Market fit", "Engagement %", "Median views", "Business email",
      "Commercial evidence", "Sponsorship availability", "Concerns", "Rejection reasons", "Best evidence title", "Best evidence URL",
    ];
    const rows = shown.map((c, i) => [
      i + 1, c.title, c.channelUrl, c.subscriberCount, c.country || "Not available", c.tier, c.score.total, c.relevantVideoCount,
      c.analyzedVideoCount, c.mainContent, c.productTypesReviewed.join(" | "), `${c.marketFit} — ${c.marketEvidence}`,
      c.engagementRate ?? "Not available", c.medianViews ?? "Not available", c.email ?? "Not available",
      c.commercialEvidence.join(" | "), c.sponsorshipAvailability, c.concerns.join(" | "), c.rejectionReasons.join(" | "),
      c.evidence[0]?.title ?? "", c.evidence[0]?.url ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    const slug = (profile?.targetProducts[0] ?? "campaign").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    link.href = url;
    link.download = `campaign-discovery-${slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Step 1 — the brief */}
      <div className="card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink)]">Describe the campaign</h2>
          <p className="text-[12px] text-[var(--muted-2)] mt-0.5">
            Market, subscriber range, products, content types, brands — in plain language. Nothing is searched until you&apos;ve reviewed the profile.
          </p>
        </div>
        <textarea
          className="input font-sans text-sm"
          style={{ minHeight: 88, resize: "vertical" }}
          placeholder={BRIEF_EXAMPLE}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void buildProfile()} disabled={parsing || running} className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-50">
            {parsing ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {parsing ? "Reading brief…" : "Build discovery profile"}
          </button>
          {!brief && (
            <button type="button" onClick={() => setBrief(BRIEF_EXAMPLE)} className="text-xs font-medium text-[var(--brand-teal-dark)]">
              Use the example brief
            </button>
          )}
        </div>
      </div>

      {/* Step 1 output — editable profile */}
      {profile && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink)]">Discovery profile</h2>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
              style={{ background: "var(--neutral-bg)", color: "var(--neutral-fg)" }}
            >
              {parseSource === "ai" ? <Sparkles size={11} /> : null}
              {parseSource === "ai" ? "Parsed with AI" : "Parsed with rules"} — review before running
            </span>
          </div>

          {parseNotes.length > 0 && (
            <ul className="text-[11.5px] text-[var(--muted)] space-y-0.5">
              {parseNotes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Market">
              <select className="input py-1.5 text-xs" value={profile.market} onChange={(e) => patch({ market: e.target.value })}>
                {MARKETS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subscribers">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className="input py-1.5 text-xs"
                  placeholder="Min"
                  value={profile.minSubscribers ?? ""}
                  onChange={(e) => patch({ minSubscribers: e.target.value ? Number(e.target.value) : null })}
                />
                <span className="text-[var(--muted-2)] text-xs">–</span>
                <input
                  type="number"
                  className="input py-1.5 text-xs"
                  placeholder="Max"
                  value={profile.maxSubscribers ?? ""}
                  onChange={(e) => patch({ maxSubscribers: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </Field>
            <Field label="Category">
              <input className="input py-1.5 text-xs" value={profile.category} placeholder="e.g. fitness" onChange={(e) => patch({ category: e.target.value })} />
            </Field>
            <Field label="Creators needed · min engagement %">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className="input py-1.5 text-xs"
                  value={profile.creatorCount}
                  min={5}
                  max={50}
                  onChange={(e) => patch({ creatorCount: Math.min(Math.max(Number(e.target.value) || 20, 5), 50) })}
                />
                <input
                  type="number"
                  step="0.1"
                  className="input py-1.5 text-xs"
                  placeholder="Any"
                  value={profile.minEngagementRate ?? ""}
                  onChange={(e) => patch({ minEngagementRate: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </Field>
          </div>

          <ChipEditor
            label="Target products — exact matches"
            values={profile.targetProducts}
            placeholder="Add a product and press Enter"
            onChange={(targetProducts) => patch({ targetProducts })}
          />
          <ChipEditor
            label="Related products — semantic expansion, scored as related"
            values={profile.relatedTerms}
            placeholder="Add a related product"
            onChange={(relatedTerms) => patch({ relatedTerms })}
          />
          <ChipEditor label="Brands (optional)" values={profile.brands} placeholder="Add a brand" onChange={(brands) => patch({ brands })} />

          <div>
            <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">Content types</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_OPTIONS.map((format) => {
                const active = profile.desiredContent.includes(format);
                return (
                  <button
                    key={format}
                    type="button"
                    onClick={() =>
                      patch({ desiredContent: active ? profile.desiredContent.filter((f) => f !== format) : [...profile.desiredContent, format] })
                    }
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium capitalize transition-colors"
                    style={
                      active
                        ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }
                        : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
                    }
                  >
                    {format}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12px] text-[var(--muted)] cursor-pointer w-fit">
            <input type="checkbox" checked={profile.requireProductReviewers} onChange={(e) => patch({ requireProductReviewers: e.target.checked })} />
            Require product-review behavior — reject creators who never review, unbox or test products
          </label>

          <div>
            <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">
              Keyword matrix · {keywordPreview.length} planned searches
            </label>
            <div className="flex flex-wrap gap-1">
              {keywordPreview.slice(0, 18).map((q) => (
                <span key={q} className="px-2 py-0.5 rounded text-[11px]" style={{ background: "var(--bg)", color: "var(--muted)" }}>
                  {q}
                </span>
              ))}
              {keywordPreview.length > 18 && <span className="px-2 py-0.5 text-[11px] text-[var(--muted-2)]">+{keywordPreview.length - 18} more</span>}
            </div>
            <p className="text-[11px] text-[var(--muted-2)] mt-1">
              More phrases are mined from the titles YouTube returns while searching, and the search stops early once new queries mostly re-find the same creators.
            </p>
          </div>

          <div className="flex items-end justify-between gap-3 flex-wrap border-t border-[var(--border)] pt-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">Search depth</label>
              <div className="flex gap-1.5 flex-wrap">
                {depths.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDepth(d.key)}
                    className="px-3 py-1.5 rounded-lg text-[11.5px] text-left transition-colors border"
                    style={
                      depth === d.key
                        ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)", borderColor: "var(--brand-teal-dark)" }
                        : { background: "transparent", color: "var(--muted)", borderColor: "var(--border)" }
                    }
                  >
                    <span className="font-semibold">{d.label}</span>
                    <span className="block text-[10.5px] opacity-80">
                      up to {d.maxQueries} searches · {d.analyzeLimit} creators · ≤{d.estimatedUnits.toLocaleString()} units
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => void runDiscovery()} disabled={running} className="btn-primary inline-flex items-center gap-1.5 px-5 py-2 text-sm disabled:opacity-50">
              {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {running ? "Running…" : `Run discovery${selectedDepth ? ` (≤${selectedDepth.estimatedUnits.toLocaleString()} units)` : ""}`}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </p>
      )}

      {/* Live progress */}
      {running && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <Loader2 size={15} className="animate-spin" /> {stageMessage}
          </div>
          {progress && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <ProgressStat label="Searches run" value={`${progress.queriesRun} / ${progress.queriesPlanned}`} />
              <ProgressStat label="Creators found" value={progress.uniqueChannels.toLocaleString()} />
              <ProgressStat label="Histories analyzed" value={progress.toAnalyze > 0 ? `${progress.analyzed} / ${progress.toAnalyze}` : "—"} />
              <ProgressStat label="API units" value={progress.unitsUsed.toLocaleString()} />
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && profile && (
        <div className="space-y-3">
          <div className="card p-4 space-y-2 text-[12px] text-[var(--muted)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[var(--ink)] font-medium">
                {result.stats.analyzedCreators} creators analyzed · A {result.tierCounts.A} · B {result.tierCounts.B} · C {result.tierCounts.C} · D{" "}
                {result.tierCounts.D}
              </span>
              <span>
                {result.stats.queriesRun.length} searches · {result.stats.uniqueChannelsFound} creators found · {result.stats.unitsUsed.toLocaleString()} units ·{" "}
                {Math.round(result.stats.durationMs / 1000)}s
              </span>
            </div>
            <p>Stopped: {result.stats.stopReason}.</p>
            {result.stats.minedTerms.length > 0 && (
              <p>
                Related phrases found in results:{" "}
                {result.stats.minedTerms
                  .map((term) => (result.stats.queriesRun.some((q) => q.includes(term)) ? `${term} (searched)` : term))
                  .join(", ")}
                {result.stats.minedTerms.some((term) => !result.stats.queriesRun.some((q) => q.includes(term)))
                  ? " — a deeper search runs the rest."
                  : "."}
              </p>
            )}
            {Object.keys(result.stats.notQualified).length > 0 && (
              <p>
                Filtered out before scoring:{" "}
                {Object.entries(result.stats.notQualified)
                  .map(([reason, n]) => `${reason} (${n})`)
                  .join(" · ")}
              </p>
            )}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <div className="flex flex-wrap gap-1.5">
                {TIERS.map(({ tier, label, hint }) => {
                  const active = visibleTiers.includes(tier);
                  return (
                    <button
                      key={tier}
                      type="button"
                      title={hint}
                      onClick={() => setVisibleTiers((prev) => (active ? prev.filter((t) => t !== tier) : [...prev, tier]))}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                      style={active ? tierStyle(tier) : { background: "transparent", color: "var(--muted-2)", border: "1px solid var(--border)" }}
                    >
                      {label} ({result.tierCounts[tier]})
                    </button>
                  );
                })}
              </div>
              {shown.length > 0 && (
                <button onClick={downloadCsv} className="inline-flex items-center gap-1 font-medium text-[var(--brand-teal-dark)]">
                  <Download size={12} /> Export CSV
                </button>
              )}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="card p-10 text-center text-sm text-[var(--muted-2)]">
              No creators in the selected tiers. Try showing tier C, widening the subscriber range, or running a deeper search.
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[960px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted-2)] border-b border-[var(--border)]">
                    <th className="px-3 py-2.5 w-12">Rank</th>
                    <th className="px-3 py-2.5">Creator</th>
                    <th className="px-3 py-2.5">Subscribers</th>
                    <th className="px-3 py-2.5">Relevant videos</th>
                    <th className="px-3 py-2.5">Main content</th>
                    <th className="px-3 py-2.5">Relevance score</th>
                    <th className="px-3 py-2.5">Creator tier</th>
                    <th className="px-3 py-2.5">Best evidence</th>
                    <th className="px-3 py-2.5">Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((creator, i) => {
                    const open = expanded === creator.channelId;
                    return (
                      <Fragment key={creator.channelId}>
                        <tr
                          className="border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg)] align-top"
                          onClick={() => setExpanded(open ? null : creator.channelId)}
                        >
                          <td className="px-3 py-2.5 text-[var(--muted)]">
                            <span className="inline-flex items-center gap-1">
                              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[var(--bg)]">
                                {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
                                {creator.thumbnailUrl ? <img src={creator.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : null}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-[var(--ink)] truncate max-w-[180px]">{creator.title}</div>
                                <div className="text-[11px] text-[var(--muted-2)]">
                                  {creator.country || "Country not declared"}
                                  {creator.alreadyInLibrary ? " · In Library" : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[var(--ink)]">{compact(creator.subscriberCount)}</td>
                          <td className="px-3 py-2.5 text-[var(--ink)]">
                            {creator.relevantVideoCount}
                            <span className="text-[var(--muted-2)]"> / {creator.analyzedVideoCount}</span>
                          </td>
                          <td className="px-3 py-2.5 text-[var(--muted)] max-w-[200px]">{creator.mainContent}</td>
                          <td className="px-3 py-2.5">
                            <span className="text-[15px] font-semibold text-[var(--ink)]">{creator.score.total}</span>
                            <span className="text-[var(--muted-2)]">/100</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <TierBadge tier={creator.tier} />
                          </td>
                          <td className="px-3 py-2.5 max-w-[220px]">
                            {creator.evidence[0] ? (
                              <a
                                href={creator.evidence[0].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[var(--brand-teal-dark)] hover:underline line-clamp-2"
                              >
                                {creator.evidence[0].title}
                              </a>
                            ) : (
                              <span className="text-[var(--muted-2)]">Not available</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <a
                              href={creator.channelUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[var(--muted)] hover:text-[var(--ink)]"
                            >
                              <ExternalLink size={13} /> Open
                            </a>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-[var(--border)]">
                            <td colSpan={9} className="px-4 py-4" style={{ background: "var(--bg)" }}>
                              <CreatorDetail creator={creator} niche={profile.targetProducts.join(", ")} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function tierStyle(tier: CreatorTier): React.CSSProperties {
  switch (tier) {
    case "A":
      return { background: "var(--success-bg)", color: "var(--success-fg)" };
    case "B":
      return { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" };
    case "C":
      return { background: "var(--neutral-bg)", color: "var(--neutral-fg)" };
    default:
      return { background: "var(--neutral-bg)", color: "var(--danger-fg)" };
  }
}

function TierBadge({ tier }: { tier: CreatorTier }) {
  const label = { A: "Excellent fit", B: "Strong fit", C: "Possible fit", D: "Poor fit" }[tier];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={tierStyle(tier)}>
      Tier {tier} · {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-[var(--muted-2)]">{label}</div>
      <div className="text-[15px] font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}

function ChipEditor({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const part of parts) if (!next.some((v) => v.toLowerCase() === part.toLowerCase())) next.push(part);
    onChange(next);
    setDraft("");
  }

  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--muted-2)] uppercase tracking-wide mb-1.5">{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px]"
            style={{ background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }}
          >
            {value}
            <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[140px] bg-transparent outline-none text-[12px] text-[var(--ink)] py-0.5"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
        />
      </div>
    </div>
  );
}

function CreatorDetail({ creator, niche }: { creator: QualifiedCreator; niche: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-[12.5px]">
      <div className="lg:col-span-2 space-y-4">
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-2)] mb-1.5">Creator summary</h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
            <SummaryItem label="What they normally create" value={creator.mainContent} />
            <SummaryItem
              label="Relevant videos found"
              value={`${creator.relevantVideoCount} directly relevant · ${creator.relatedVideoCount} related · ${creator.analyzedVideoCount} analyzed`}
            />
            <SummaryItem label="Products they review" value={creator.productTypesReviewed.length > 0 ? creator.productTypesReviewed.join(", ") : "Not available"} />
            <SummaryItem label="Audience / market" value={creator.marketEvidence} />
            <SummaryItem
              label="Engagement"
              value={
                creator.engagementRate === null
                  ? "Not available"
                  : `${creator.engagementRate}% · median ${compact(creator.medianViews)} views${creator.viewToSubscriberRate !== null ? ` (${creator.viewToSubscriberRate}% of subscribers)` : ""}`
              }
            />
            <SummaryItem label="Business email" value={creator.email ?? "Not available"} />
          </dl>
        </section>

        {creator.rejectionReasons.length > 0 && (
          <BulletList title="Why this creator was rejected" items={creator.rejectionReasons} icon={<AlertTriangle size={12} style={{ color: "var(--danger-fg)" }} />} />
        )}
        <BulletList title="Why they fit" items={creator.whyFit} empty="No fit evidence found" icon={<CheckCircle2 size={12} style={{ color: "var(--success-fg)" }} />} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BulletList title="Evidence of commercial / product-review activity" items={creator.commercialEvidence} empty="None found in the analyzed videos" />
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-2)] mb-1.5">Confirmed sponsorship availability</h4>
            <p className="text-[var(--ink)] font-medium">{creator.sponsorshipAvailability}</p>
            <p className="text-[11.5px] text-[var(--muted-2)] mt-0.5">
              Public videos can show commercial activity, never whether a creator is currently open to sponsorships — confirm by contacting them.
            </p>
          </section>
        </div>

        <BulletList title="Potential concerns" items={creator.concerns} empty="None flagged" icon={<AlertTriangle size={12} style={{ color: "var(--muted-2)" }} />} />

        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-2)] mb-1.5">Relevant video evidence</h4>
          {creator.evidence.length === 0 ? (
            <p className="text-[var(--muted-2)]">No relevant videos found.</p>
          ) : (
            <ol className="space-y-2">
              {creator.evidence.map((video) => (
                <li key={video.url} className="rounded-lg border border-[var(--border)] px-3 py-2" style={{ background: "var(--surface, transparent)" }}>
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--brand-teal-dark)] hover:underline">
                    {video.title}
                  </a>
                  <div className="text-[11.5px] text-[var(--muted-2)] mt-0.5">
                    {compact(video.views)} views · {shortDate(video.publishedAt)} · {video.contentType} · relevance {video.productRelevance}/5
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)] mt-0.5">{video.whyRelevant}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-2)] mb-2">Score breakdown · {creator.score.total}/100</h4>
          <div className="space-y-2">
            {SCORE_PARTS.map((part) => {
              const value = creator.score[part.key];
              return (
                <div key={part.key}>
                  <div className="flex justify-between text-[11.5px] mb-0.5">
                    <span className="text-[var(--muted)]">{part.label}</span>
                    <span className="font-semibold text-[var(--ink)]">
                      {Math.round(value)}/{part.max}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--neutral-bg)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / part.max) * 100)}%`, background: "var(--brand-teal-dark)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-2)]">Actions</h4>
          <div className="flex items-center gap-1.5 flex-wrap">
            <StartOutreachButton
              disabled={!creator.email}
              to={creator.email ?? ""}
              contactName={creator.title}
              channelName={creator.title}
              channelUrl={creator.channelUrl}
              niche={niche}
            />
            {creator.creatorId && <MediaKitButton creatorId={creator.creatorId} />}
            <a
              href={creator.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
            >
              <ExternalLink size={12} /> Channel
            </a>
          </div>
          {creator.discoveredVia.length > 0 && (
            <p className="text-[11px] text-[var(--muted-2)]">Found via: {creator.discoveredVia.slice(0, 4).join(", ")}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wide text-[var(--muted-2)]">{label}</dt>
      <dd className="text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function BulletList({ title, items, empty, icon }: { title: string; items: string[]; empty?: string; icon?: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-2)] mb-1.5">{title}</h4>
      {items.length === 0 ? (
        <p className="text-[var(--muted-2)]">{empty ?? "None"}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-1.5 text-[var(--ink)]">
              <span className="mt-0.5 shrink-0">{icon ?? "•"}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
