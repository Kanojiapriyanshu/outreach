"use client";

import { Eye, TrendingUp, Users, Zap, Calendar, MessageCircle, ExternalLink, PlayCircle } from "lucide-react";

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

export interface ChannelMediaKitData {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  thumbnailUrl: string;
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
}

function compactCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function fitVerdict(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Excellent Fit", color: "#0e9f6e" };
  if (score >= 65) return { label: "Strong Fit", color: "#157a8c" };
  if (score >= 45) return { label: "Solid Fit", color: "#d97706" };
  return { label: "Needs Review", color: "#9ca3af" };
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
    <div className="relative w-32 h-32 shrink-0">
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
        <span className="text-3xl font-bold text-slate-900">{score}</span>
        <span className="text-[10px] font-medium text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col gap-1.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
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
      <div className="p-2.5">
        <p className="text-[12px] font-semibold text-slate-900 line-clamp-2 leading-snug min-h-[2.2em]">{video.title}</p>
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
          <span>{compactCount(video.viewCount)} views</span>
          <span>{video.engagementRate.toFixed(1)}% eng.</span>
        </div>
      </div>
    </a>
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0e5c6b 0%, #157a8c 55%, #1a9cb3 100%)" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 60%, white 0, transparent 35%)" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-12 sm:py-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 ring-4 ring-white/20 bg-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
              {kit.thumbnailUrl ? <img src={kit.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <span className="inline-block px-2.5 py-1 rounded-full bg-white/15 text-white text-[11px] font-semibold uppercase tracking-wide mb-2">
                Creator Media Kit
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">{kit.channelTitle}</h1>
              <p className="text-white/80 text-sm mt-1">
                {kit.niche ? `${kit.niche} · ` : ""}
                {kit.country || "Global"}
              </p>
            </div>
            <a
              href={kit.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[#0e5c6b] text-sm font-semibold shrink-0 hover:bg-white/90 transition-colors"
            >
              <ExternalLink size={14} /> View Channel
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Headline pitch + score */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row gap-6 items-center">
          <ScoreRing score={kit.brandFitScore} />
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold mb-2" style={{ background: `${verdict.color}1a`, color: verdict.color }}>
              {verdict.label}
            </span>
            <h2 className="text-xl font-bold text-slate-900 leading-snug">{kit.narrative.headline}</h2>
            <p className="text-[14px] text-slate-600 mt-2 leading-relaxed">{kit.narrative.pitch}</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Users size={13} />} label="Subscribers" value={compactCount(kit.subscriberCount)} />
          <StatCard icon={<Eye size={13} />} label="Avg. Views" value={compactCount(kit.averageViews)} sub={`${kit.viewToSubscriberRate.toFixed(0)}% of subscribers`} />
          <StatCard icon={<TrendingUp size={13} />} label="Engagement" value={`${kit.engagementRate.toFixed(1)}%`} />
          <StatCard icon={<Calendar size={13} />} label="Cadence" value={kit.uploadFrequencyLabel.replace(/^Posts /, "")} />
        </div>

        {/* Strengths */}
        {kit.narrative.strengths.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
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

        {/* Top performing videos */}
        {kit.topVideos.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Top Performing Content</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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

        {/* Audience */}
        {kit.sampleComments.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
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
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Recent Uploads</h3>
            <div className="space-y-1.5">
              {kit.recentUploads.slice(0, 6).map((v) => (
                <a
                  key={v.videoId}
                  href={v.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 py-1.5 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <span className="text-[12px] text-slate-400 w-20 shrink-0">{formatDate(v.publishedAt)}</span>
                  <span className="text-[13px] text-slate-800 truncate flex-1">{v.title}</span>
                  <span className="text-[12px] text-slate-500 shrink-0">{compactCount(v.viewCount)} views</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Ideal fit + CTA */}
        <div className="rounded-2xl p-6 text-white" style={{ background: "linear-gradient(135deg, #0e5c6b 0%, #157a8c 100%)" }}>
          <h3 className="text-sm font-bold uppercase tracking-wide mb-2 text-white/80">Ideal Campaign Fit</h3>
          <p className="text-[14px] leading-relaxed">{kit.narrative.idealCampaignFit}</p>
        </div>

        <p className="text-center text-[11px] text-slate-400 pt-2">
          Performance figures are drawn from public YouTube data as of the date this report was generated.
        </p>
      </div>
    </div>
  );
}
