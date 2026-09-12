"use client";

import { Eye, TrendingUp, Users, Zap, Calendar, MessageCircle, ExternalLink, PlayCircle, DollarSign, Globe2 } from "lucide-react";

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
function DemographicBars({ title, icon, slices }: { title: string; icon: React.ReactNode; slices: DemographicSlice[] }) {
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
          .slice(0, 6)
          .map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-24 sm:w-20 shrink-0 text-[11.5px] text-slate-600 truncate">{s.label}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(s.percent / max) * 100}%`, background: "#157a8c" }} />
              </div>
              <span className="w-9 shrink-0 text-right text-[11.5px] font-semibold text-slate-700">{s.percent}%</span>
            </div>
          ))}
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
  const hasDemographics = kit.audienceCountries.length > 0 || kit.audienceAgeRanges.length > 0 || kit.audienceGenderSplit.length > 0;

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
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <StatCard icon={<Users size={13} />} label="Subscribers" value={compactCount(kit.subscriberCount)} />
          <StatCard icon={<Eye size={13} />} label="Avg. Views" value={compactCount(kit.averageViews)} sub={`${kit.viewToSubscriberRate.toFixed(0)}% of subscribers`} />
          <StatCard icon={<TrendingUp size={13} />} label="Engagement" value={`${kit.engagementRate.toFixed(1)}%`} />
          <StatCard icon={<Calendar size={13} />} label="Cadence" value={kit.uploadFrequencyLabel.replace(/^Posts /, "")} />
        </div>

        {/* Strengths */}
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

        {/* Estimated sponsorship value */}
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

        {/* Audience demographics — only ever real numbers the creator has shared, never a guess */}
        {hasDemographics && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Audience Demographics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
              <DemographicBars title="Top Locations" icon={<Globe2 size={12} />} slices={kit.audienceCountries} />
              <DemographicBars title="Age Range" icon={<Users size={12} />} slices={kit.audienceAgeRanges} />
              <DemographicBars title="Gender" icon={<Users size={12} />} slices={kit.audienceGenderSplit} />
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
              {kit.sampleComments.slice(0, 4).map((c, i) => (
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
              {kit.recentUploads.slice(0, 6).map((v) => (
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
