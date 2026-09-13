"use client";

import {
  Eye,
  TrendingUp,
  Users,
  Zap,
  Calendar,
  MessageCircle,
  ExternalLink,
  PlayCircle,
  DollarSign,
  Globe2,
  Smartphone,
  CheckCircle2,
  BarChart3,
  ThumbsUp,
  Video,
  MapPin,
  Languages,
  Tags,
  Award,
  Rocket,
  ShieldCheck,
} from "lucide-react";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "Twitter / X",
  pinterest: "Pinterest",
  facebook: "Facebook",
  amazonStorefront: "Amazon Storefront",
};

interface VideoSummary {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  viewCount: number;
  engagementRate: number;
  publishedAt: string | null;
  durationDisplay: string;
}

interface DemographicSlice {
  label: string;
  percent: number;
}

interface SponsorshipEstimate {
  low: number;
  mid: number;
  high: number;
  basis: string;
}

interface SelectionSignals {
  nicheRelevancyPercent: number;
  uploadsLast90Days: number;
  brandSafetyLabel: string;
  brandSafetyScore: number;
  sponsorshipFrequencyPercent: number;
  recommendedDeliverables: string[];
}

interface AudienceEstimate {
  likelyPrimaryMarket: string;
  primaryMarketConfidence: number;
  contentLanguage: string;
  topics: string[];
  estimatedCountries: DemographicSlice[];
  estimatedGenderSplit: DemographicSlice[];
  estimatedAgeSplit: DemographicSlice[];
  dominantAgeBand: string | null;
  benchmarkCategoryLabel: string;
  benchmarkConfidence: "medium" | "low-medium" | "low";
  benchmarkBasis: string[];
}

interface PerformanceSummary {
  medianViews: number;
  averageLikes: number;
  averageComments: number;
  longFormPercent: number;
  shortsPercent: number;
}

interface CreatorScorecard {
  engagement: number;
  consistency: number;
  authenticity: number;
  brandSafety: number;
  nicheRelevance: number;
  sponsorshipExperience: number;
}

interface CampaignProjection {
  budgetTier: string;
  sizeTier: string;
  channelAgeLabel: string;
  projectedReachLow: number;
  projectedReachHigh: number;
  mediaValueLow: number;
  mediaValueHigh: number;
  projectedEngagementsLow: number;
  projectedEngagementsHigh: number;
  projectedClicksLow: number;
  projectedClicksHigh: number;
}

export interface ChannelMediaKitData {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  thumbnailUrl: string;
  bannerUrl: string;
  country: string;
  niche: string;
  subscriberCount: number;
  totalViewCount: number;
  videoCount: number;
  averageViews: number;
  engagementRate: number;
  viewToSubscriberRate: number;
  brandFitScore: number;
  uploadFrequencyLabel: string;
  topCategories: string[];
  topVideos: VideoSummary[];
  recentUploads: VideoSummary[];
  platformLinks: Record<string, string>;
  sampleComments: string[];
  narrative: {
    headline: string;
    pitch: string;
    strengths: string[];
    idealCampaignFit: string;
    audienceInsight: string;
  };
  sponsorshipEstimate: SponsorshipEstimate;
  audienceCountries: DemographicSlice[];
  audienceAgeRanges: DemographicSlice[];
  audienceGenderSplit: DemographicSlice[];
  audienceDevices: DemographicSlice[];
  selectionSignals: SelectionSignals;
  audienceEstimate: AudienceEstimate;
  performanceSummary: PerformanceSummary;
  scorecard: CreatorScorecard;
  campaignProjection: CampaignProjection;
}

function compactCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function compactMoney(n: number): string {
  return `$${compactCount(n)}`;
}

// Every tier reads as a positive invitation — see the comment on fitLabel() in
// channelMediaKitAI.ts for why the wording (and here, the coloring) never dips into "warning"
// territory. The real signal is the score number itself and the data around it, not the label.
function fitVerdict(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Excellent Fit", color: "#0e9f6e" };
  if (score >= 65) return { label: "Strong Fit", color: "#157a8c" };
  if (score >= 45) return { label: "Solid Fit", color: "#d97706" };
  return { label: "Rising Talent", color: "#7c3aed" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** A gauge-style score ring, hand-rolled SVG like every other chart in this app (no charting
 * library anywhere in the codebase) — a full circle at 100, sweeping proportionally below that. */
function ScoreRing({ score }: { score: number }) {
  const verdict = fitVerdict(score);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={verdict.color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold text-slate-900">{score}</span>
        <span className="text-[10px] font-medium text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4 flex flex-col gap-1.5 shadow-sm min-w-0">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}
        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide truncate">{label}</span>
      </div>
      <span className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{value}</span>
      {sub && <span className="text-[11px] text-slate-500 truncate">{sub}</span>}
    </div>
  );
}

function VideoCard({ video }: { video: VideoSummary }) {
  return (
    <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" className="group block rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
        {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : null}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <PlayCircle size={28} className="text-white opacity-0 group-hover:opacity-90 transition-opacity drop-shadow" />
        </div>
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium">{video.durationDisplay}</span>
      </div>
      <div className="p-2 sm:p-2.5">
        <p className="text-[11.5px] sm:text-[12px] font-semibold text-slate-900 line-clamp-2 leading-snug min-h-[2.2em]">{video.title}</p>
        <div className="flex items-center justify-between mt-1.5 text-[10.5px] sm:text-[11px] text-slate-500">
          <span>{compactCount(video.viewCount)} views</span>
          <span>{video.engagementRate.toFixed(1)}% eng.</span>
        </div>
      </div>
    </a>
  );
}

/** One horizontal bar-list for a demographic category — the plainest, most legible way to show a
 * handful of percentages, and consistent with the rest of the app never reaching for a charting
 * library. Bars are proportional to the largest slice in the list, not to 100%, so a category with
 * only two or three known slices doesn't read as mostly-empty. */
function DemographicBars({
  title,
  icon,
  slices,
  limit = 6,
  estimated = false,
  coreLabel = null,
}: {
  title: string;
  icon: React.ReactNode;
  slices: DemographicSlice[];
  limit?: number;
  /** True for a category-benchmark/formula stand-in, never real transcribed numbers — prefixes
   * every value with "~" so a brand can tell measured from modelled at a glance. */
  estimated?: boolean;
  /** The band this creator's estimate names as most likely, tagged CORE — never set for verified
   * (real) data, since that distinction only means something for a modelled guess. */
  coreLabel?: string | null;
}) {
  if (slices.length === 0) return null;
  const max = Math.max(...slices.map((s) => s.percent));
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2.5">
        {icon} {title}
      </h4>
      <div className="space-y-2">
        {slices
          .slice()
          .sort((a, b) => b.percent - a.percent)
          .slice(0, limit)
          .map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-24 sm:w-20 shrink-0 text-[11.5px] text-slate-600 truncate flex items-center gap-1">
                {s.label}
                {coreLabel === s.label && <span className="rounded bg-teal-100 px-1 py-0.5 text-[9px] font-bold text-teal-800">CORE</span>}
              </span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(s.percent / max) * 100}%`, background: "#157a8c" }} />
              </div>
              <span className="w-10 shrink-0 text-right text-[11.5px] font-semibold text-slate-700">
                {estimated ? "~" : ""}
                {s.percent}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white text-[13px] text-slate-700 shadow-sm">
      <CheckCircle2 size={15} className="shrink-0" style={{ color: "#157a8c" }} />
      <span>{children}</span>
    </div>
  );
}

/** Diagnostic sub-scores can show a weaker signal than the headline Brand Fit Score ever does —
 * unlike fitVerdict, these exist precisely to show where a creator is soft, so a low one stays
 * visibly low rather than being rounded up to something reassuring. */
function scoreTone(score: number): string {
  if (score >= 80) return "#0e9f6e";
  if (score >= 60) return "#157a8c";
  if (score >= 40) return "#d97706";
  return "#e11d48";
}

function ScorecardBar({ label, score }: { label: string; score: number }) {
  const color = scoreTone(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] text-slate-700">{label}</span>
        <span className="text-[13px] font-bold" style={{ color }}>
          {score}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

/**
 * The document itself — designed to be handed to a brand as the case for a deal, not to match the
 * CRM's own admin styling. Forces a clean, consistent light presentation (same call SharedReportView
 * already makes for Insight OS's public reports) since this goes out to people who never open the
 * CRM and shouldn't see it half-styled by whatever theme their own browser happens to prefer.
 */
export default function ChannelMediaKitView({ kit }: { kit: ChannelMediaKitData }) {
  const verdict = fitVerdict(kit.brandFitScore);
  const platformEntries = Object.entries(kit.platformLinks).filter(([, url]) => !!url);
  // Older stored kits were generated before these fields existed — default them so those records
  // (the JSON blob is a point-in-time snapshot, never migrated) don't crash the view.
  const audienceDevices = kit.audienceDevices ?? [];
  const selectionSignals = kit.selectionSignals as SelectionSignals | undefined;
  const audienceEstimate = kit.audienceEstimate as AudienceEstimate | undefined;
  const performanceSummary = kit.performanceSummary as PerformanceSummary | undefined;
  const scorecard = kit.scorecard as CreatorScorecard | undefined;
  const campaignProjection = kit.campaignProjection as CampaignProjection | undefined;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Hero — the creator's own real channel banner where one exists, so the document opens with
          their own visual identity rather than a generic gradient standing in for it. */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={
            kit.bannerUrl
              ? { backgroundImage: `url(${kit.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: "linear-gradient(135deg, #0e5c6b 0%, #157a8c 55%, #1a9cb3 100%)" }
          }
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(14,44,51,0.55) 0%, rgba(14,44,51,0.82) 100%)" }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 ring-4 ring-white/20 bg-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
              {kit.thumbnailUrl ? <img src={kit.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-block px-2.5 py-1 rounded-full bg-white/15 text-white text-[11px] font-semibold uppercase tracking-wide mb-2">
                Creator Media Kit
              </span>
              <h1 className="text-xl sm:text-3xl font-bold text-white truncate">{kit.channelTitle}</h1>
              <p className="text-white/80 text-sm mt-1">
                {kit.niche ? `${kit.niche} · ` : ""}
                {kit.country || "Global"}
              </p>
            </div>
            <a
              href={kit.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto justify-center sm:justify-start inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[#0e5c6b] text-sm font-semibold shrink-0 hover:bg-white/90 transition-colors"
            >
              <ExternalLink size={14} /> View Channel
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Headline pitch + score */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:gap-6 items-center text-center sm:text-left">
          <ScoreRing score={kit.brandFitScore} />
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold mb-2" style={{ background: `${verdict.color}1a`, color: verdict.color }}>
              {verdict.label}
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">{kit.narrative.headline}</h2>
            <p className="text-[13.5px] sm:text-[14px] text-slate-600 mt-2 leading-relaxed">{kit.narrative.pitch}</p>
            {campaignProjection && (
              <p className="text-[12px] text-slate-500 mt-2">
                Budget tier: <span className="font-semibold text-slate-700">{campaignProjection.budgetTier}</span>
              </p>
            )}
          </div>
        </div>

        {/* Why we selected this creator — formula-derived signals, not a subjective opinion. Every
            number here is computed from the same sampled uploads the rest of the kit uses. */}
        {selectionSignals && (
          <div className="rounded-2xl border p-5 sm:p-6" style={{ background: "#e3f2f5", borderColor: "#bfe1e7" }}>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 mb-4">
              <CheckCircle2 size={15} style={{ color: "#157a8c" }} /> Why We Selected This Creator
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <ChecklistItem>{selectionSignals.nicheRelevancyPercent}% relevancy score for this niche</ChecklistItem>
              <ChecklistItem>{kit.engagementRate.toFixed(2)}% engagement rate from recent videos</ChecklistItem>
              <ChecklistItem>{selectionSignals.uploadsLast90Days} uploads in the last 90 days</ChecklistItem>
              <ChecklistItem>{selectionSignals.brandSafetyLabel} brand safety signal</ChecklistItem>
              <ChecklistItem>{selectionSignals.sponsorshipFrequencyPercent}% sponsorship frequency detected</ChecklistItem>
            </div>
            {selectionSignals.recommendedDeliverables.length > 0 && (
              <div className="mt-4">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Recommended Deliverables</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectionSignals.recommendedDeliverables.map((d) => (
                    <span key={d} className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-white text-[#0e5c6b] border border-[#bfe1e7]">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Strengths — grouped with "Why We Selected This Creator" above since both make the same
            case (why to work with this creator), just narrative vs. checklist. */}
        {kit.narrative.strengths.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Why {kit.channelTitle}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {kit.narrative.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
                  <Zap size={13} className="mt-0.5 shrink-0" style={{ color: "#157a8c" }} />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audience Profile. Gender/Age use real transcribed numbers whenever someone has entered
            them (badge: "Verified", plain percentages) and otherwise fall back to a category
            benchmark (badge: "Category benchmark", every value prefixed "~") — see
            lib/youtube/audienceEstimation.ts for why that's the only honest way to fill the gap.
            Top Locations follows the same real-vs-estimate split on its own (one real country
            breakdown can exist without real age/gender, and vice versa). Devices has no
            legitimate estimate at all, so it only ever shows when a human entered it. */}
        {(() => {
          const genderVerified = kit.audienceGenderSplit.length > 0;
          const ageVerified = kit.audienceAgeRanges.length > 0;
          const fullyVerified = genderVerified && ageVerified;
          const genderRows = genderVerified ? kit.audienceGenderSplit : audienceEstimate?.estimatedGenderSplit ?? [];
          const ageRows = ageVerified ? kit.audienceAgeRanges : audienceEstimate?.estimatedAgeSplit ?? [];
          const countryVerified = kit.audienceCountries.length > 0;
          const countryRows = countryVerified ? kit.audienceCountries : audienceEstimate?.estimatedCountries ?? [];

          // A kit generated before any of this existed has no audienceEstimate and no manual
          // entries either — nothing to show, so skip the section rather than render an empty
          // card with a badge over nothing.
          const hasAnything = genderRows.length > 0 || ageRows.length > 0 || countryRows.length > 0 || audienceDevices.length > 0;
          if (!hasAnything) return null;

          return (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Audience Profile</h3>
                {fullyVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide" style={{ background: "#e3f2f5", color: "#0e5c6b" }}>
                    <ShieldCheck size={11} /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                    Category benchmark
                  </span>
                )}
              </div>
              {!fullyVerified && audienceEstimate?.benchmarkCategoryLabel && (
                <p className="text-[12px] text-slate-500 mb-4">
                  Audience profile for {audienceEstimate.benchmarkCategoryLabel} content at this creator&apos;s format mix.
                </p>
              )}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 ${!fullyVerified && audienceEstimate?.benchmarkCategoryLabel ? "" : "mt-4"}`}>
                <DemographicBars title="Top Locations" icon={<Globe2 size={12} />} slices={countryRows} limit={10} estimated={!countryVerified} />
                <DemographicBars
                  title="Age Range"
                  icon={<Users size={12} />}
                  slices={ageRows}
                  estimated={!ageVerified}
                  coreLabel={!ageVerified ? audienceEstimate?.dominantAgeBand ?? null : null}
                />
                <DemographicBars title="Gender" icon={<Users size={12} />} slices={genderRows} estimated={!genderVerified} />
                <DemographicBars title="Devices" icon={<Smartphone size={12} />} slices={audienceDevices} />
              </div>

              {audienceEstimate && (
                <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <h5 className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      <MapPin size={12} /> Likely Primary Market
                    </h5>
                    <p className="text-[14px] font-bold text-slate-900">{audienceEstimate.likelyPrimaryMarket}</p>
                    {audienceEstimate.primaryMarketConfidence > 0 && (
                      <p className="text-[11px] text-slate-500">{audienceEstimate.primaryMarketConfidence}% confidence in this market</p>
                    )}
                  </div>
                  <div>
                    <h5 className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                      <Languages size={12} /> Content Language
                    </h5>
                    <p className="text-[14px] font-bold text-slate-900">{audienceEstimate.contentLanguage}</p>
                  </div>
                  {audienceEstimate.topics.length > 0 && (
                    <div>
                      <h5 className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        <Tags size={12} /> Topics
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {audienceEstimate.topics.slice(0, 6).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!fullyVerified && audienceEstimate && audienceEstimate.benchmarkBasis.length > 0 && (
                <p className="mt-5 pt-4 border-t border-slate-100 text-[11px] leading-5 text-slate-400">
                  <span className="font-semibold text-slate-500">Method:</span> {audienceEstimate.benchmarkBasis.join(" · ")}. Audience composition
                  modelled on category benchmarks; channel performance figures elsewhere in this kit are measured from public YouTube data.
                </p>
              )}
            </div>
          );
        })()}

        {/* Performance */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Performance</h3>
          <p className="text-[12px] text-slate-500 mt-0.5 mb-3.5">Measured from this creator&apos;s public uploads.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <StatCard icon={<Eye size={13} />} label="Avg Views" value={compactCount(kit.averageViews)} sub="Recent uploads" />
            {performanceSummary && <StatCard icon={<BarChart3 size={13} />} label="Median Views" value={compactCount(performanceSummary.medianViews)} sub="Typical upload" />}
            <StatCard icon={<TrendingUp size={13} />} label="Engagement" value={`${kit.engagementRate.toFixed(2)}%`} sub="Likes + comments / views" />
            <StatCard icon={<Zap size={13} />} label="View/Sub" value={`${kit.viewToSubscriberRate.toFixed(2)}%`} sub="Reach beyond subs" />
            {performanceSummary && <StatCard icon={<ThumbsUp size={13} />} label="Avg Likes" value={compactCount(performanceSummary.averageLikes)} />}
            {performanceSummary && <StatCard icon={<MessageCircle size={13} />} label="Avg Comments" value={compactCount(performanceSummary.averageComments)} />}
            <StatCard icon={<Video size={13} />} label="Total Videos" value={compactCount(kit.videoCount)} />
            {selectionSignals && <StatCard icon={<Calendar size={13} />} label="Uploads / 90d" value={String(selectionSignals.uploadsLast90Days)} sub="Monthly" />}
          </div>
          {performanceSummary && (performanceSummary.longFormPercent > 0 || performanceSummary.shortsPercent > 0) && (
            <div className="mt-4">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Content Format Mix</h4>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                <div className="h-full" style={{ width: `${performanceSummary.longFormPercent}%`, background: "#157a8c" }} />
                <div className="h-full" style={{ width: `${performanceSummary.shortsPercent}%`, background: "#a3e0ea" }} />
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11.5px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#157a8c" }} /> Long-form {performanceSummary.longFormPercent}%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#a3e0ea" }} /> Shorts {performanceSummary.shortsPercent}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Creator Scorecard — six formula-derived sub-scores behind the headline Brand Fit Score */}
        {scorecard && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 uppercase tracking-wide mb-1">
              <Award size={15} style={{ color: "#157a8c" }} /> Creator Scorecard
            </h3>
            <p className="text-[12px] text-slate-500 mb-4">Computed from public YouTube performance signals.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
              <ScorecardBar label="Engagement" score={scorecard.engagement} />
              <ScorecardBar label="Consistency" score={scorecard.consistency} />
              <ScorecardBar label="Authenticity" score={scorecard.authenticity} />
              <ScorecardBar label="Brand Safety" score={scorecard.brandSafety} />
              <ScorecardBar label="Niche Relevance" score={scorecard.nicheRelevance} />
              <ScorecardBar label="Sponsorship Experience" score={scorecard.sponsorshipExperience} />
            </div>
          </div>
        )}

        {/* Top performing videos */}
        {kit.topVideos.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Top Performing Content</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {kit.topVideos.map((v) => (
                <VideoCard key={v.videoId} video={v} />
              ))}
            </div>
          </div>
        )}

        {/* Category + platforms */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {kit.topCategories.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2.5">Content Categories</h3>
              <div className="flex flex-wrap gap-1.5">
                {kit.topCategories.map((c) => (
                  <span key={c} className="px-2.5 py-1 rounded-full text-[12px] font-medium" style={{ background: "#e3f2f5", color: "#0e5c6b" }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {platformEntries.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2.5">Also Active On</h3>
              <div className="flex flex-wrap gap-1.5">
                {platformEntries.map(([key, url]) => (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    {PLATFORM_LABEL[key] ?? key}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Audience sentiment */}
        {kit.sampleComments.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MessageCircle size={14} /> What the Audience Says
            </h3>
            <p className="text-[13px] text-slate-600 mb-3">{kit.narrative.audienceInsight}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {kit.sampleComments.slice(0, 6).map((c, i) => (
                <p key={i} className="text-[12.5px] text-slate-600 italic border-l-2 pl-3 py-0.5 leading-relaxed" style={{ borderColor: "#157a8c" }}>
                  &ldquo;{c.length > 160 ? `${c.slice(0, 160)}…` : c}&rdquo;
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Recent uploads */}
        {kit.recentUploads.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Recent Uploads</h3>
            <div className="space-y-1.5">
              {kit.recentUploads.slice(0, 10).map((v) => (
                <a
                  key={v.videoId}
                  href={v.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 sm:gap-3 py-1.5 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <span className="text-[11px] sm:text-[12px] text-slate-400 w-16 sm:w-20 shrink-0">{formatDate(v.publishedAt)}</span>
                  <span className="text-[12.5px] sm:text-[13px] text-slate-800 truncate flex-1">{v.title}</span>
                  <span className="text-[11px] sm:text-[12px] text-slate-500 shrink-0">{compactCount(v.viewCount)} views</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Estimated sponsorship value — placed with Full Transparency below since both make the
            investment case, once the brand has already seen the audience/performance evidence
            above. */}
        <div className="rounded-2xl border p-5 sm:p-6" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 uppercase tracking-wide mb-1">
            <DollarSign size={15} style={{ color: "#d97706" }} /> Estimated Sponsorship Value
          </h3>
          <div className="flex items-baseline gap-2 flex-wrap mt-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900">
              {compactMoney(kit.sponsorshipEstimate.low)} – {compactMoney(kit.sponsorshipEstimate.high)}
            </span>
            <span className="text-[12px] text-slate-500">for {kit.sponsorshipEstimate.basis}</span>
          </div>
          <p className="text-[11.5px] text-slate-500 mt-2">
            Estimated using standard industry CPM benchmarks — actual rates vary by niche, deliverable, and negotiation.
          </p>
        </div>

        {/* Full transparency — every figure here is disclosed with its own formula, not stated as
            a verified analytics number, so a brand can see exactly how the projection was built. */}
        {campaignProjection && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Full Transparency</h3>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {kit.niche && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "#e3f2f5", color: "#0e5c6b" }}>
                      {kit.niche}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">{campaignProjection.sizeTier}</span>
                  {kit.country && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                      <Globe2 size={10} /> {kit.country}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">{campaignProjection.channelAgeLabel}</span>
                </div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Subscribers</p>
                  <p className="text-base font-bold text-slate-900">{compactCount(kit.subscriberCount)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Views</p>
                  <p className="text-base font-bold text-slate-900">{compactCount(kit.totalViewCount)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-4 sm:p-5" style={{ background: "#e3f2f5", borderColor: "#bfe1e7" }}>
              <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900 mb-0.5">
                <Rocket size={14} style={{ color: "#157a8c" }} /> What This Partnership Delivers
              </h4>
              <p className="text-[11.5px] text-slate-500 mb-3">Modelled on this creator&apos;s own recent performance and current category rates.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-lg bg-white p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Projected Reach</p>
                  <p className="text-[15px] font-bold text-slate-900">
                    {compactCount(campaignProjection.projectedReachLow)} – {compactCount(campaignProjection.projectedReachHigh)}
                  </p>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">Based on median views across recent uploads</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Media Value</p>
                  <p className="text-[15px] font-bold text-slate-900">
                    {compactMoney(campaignProjection.mediaValueLow)} – {compactMoney(campaignProjection.mediaValueHigh)}
                  </p>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">At $8–$20 CPM for this category</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Projected Engagements</p>
                  <p className="text-[15px] font-bold text-slate-900">
                    {compactCount(campaignProjection.projectedEngagementsLow)} – {compactCount(campaignProjection.projectedEngagementsHigh)}
                  </p>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">Reach × this creator&apos;s measured engagement rate</p>
                </div>
                <div className="rounded-lg bg-white p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Projected Clicks</p>
                  <p className="text-[15px] font-bold text-slate-900">
                    {compactCount(campaignProjection.projectedClicksLow)} – {compactCount(campaignProjection.projectedClicksHigh)}
                  </p>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">At 0.5%–1.5% sponsored-link CTR</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-3">
                Modelled from this creator&apos;s public performance and current category rates. Final results depend on creative, offer and negotiated rate.
              </p>
            </div>
          </div>
        )}

        {/* Ideal fit + CTA */}
        <div className="rounded-2xl p-5 sm:p-6 text-white" style={{ background: "linear-gradient(135deg, #0e5c6b 0%, #157a8c 100%)" }}>
          <h3 className="text-sm font-bold uppercase tracking-wide mb-2 text-white/80">Ideal Campaign Fit</h3>
          <p className="text-[13.5px] sm:text-[14px] leading-relaxed">{kit.narrative.idealCampaignFit}</p>
        </div>

        <p className="text-center text-[11px] text-slate-400 pt-2">
          Performance figures are drawn from public YouTube data as of the date this report was generated.
        </p>
      </div>
    </div>
  );
}
