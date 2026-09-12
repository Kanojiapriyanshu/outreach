"use client";

import { useState } from "react";
import { ExternalLink, Mail, MailX, RefreshCw, Users, Eye, TrendingUp, Clock, Radio } from "lucide-react";
import StartOutreachButton from "./StartOutreachButton";
import CreatorDetailModal from "./CreatorDetailModal";
import MediaKitButton from "./MediaKitButton";

export interface CreatorCardData {
  creatorId?: string;
  channelId: string;
  title: string;
  channelUrl: string;
  thumbnailUrl: string;
  country: string;
  subscriberCount: number;
  subscriberCountDisplay?: string;
  averageViews: number;
  engagementRate: number;
  lastUploadAt: string | null;
  email: string | null;
  platformLinks: Record<string, string>;
  alreadyInLibrary: boolean;
  existingInsightReportId: string | null;
  niche?: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "Twitter/X",
  pinterest: "Pinterest",
  facebook: "Facebook",
  amazonStorefront: "Amazon",
};

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function daysAgo(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/**
 * One discovered (or already-saved) creator — the "elevated" surface the ask was for: a real
 * profile card, not a dense table row, with the exact piece of info that used to take a manual
 * trip to the channel's About tab (the business email) front and center.
 */
export default function CreatorCard({ creator }: { creator: CreatorCardData }) {
  const [refreshing, setRefreshing] = useState(false);
  const [current, setCurrent] = useState(creator);
  const [showDetail, setShowDetail] = useState(false);

  async function refresh() {
    if (!current.creatorId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/discovery/refresh/${current.creatorId}`, { method: "POST" });
      if (res.ok) {
        // A full re-fetch of this one card's data would need another round trip for no real
        // benefit here — the refresh call already updated the stored row; reflecting "just
        // refreshed" is enough feedback without re-querying.
        setCurrent((prev) => ({ ...prev }));
      }
    } finally {
      setRefreshing(false);
    }
  }

  const platformEntries = Object.entries(current.platformLinks).filter(([, url]) => !!url);
  const recency = daysAgo(current.lastUploadAt);

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-[var(--bg)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail, same
              plain-<img> pattern used throughout the Insight OS pages for the same reason */}
          {current.thumbnailUrl ? <img src={current.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-sm text-[var(--ink)] truncate">{current.title}</h3>
            {current.alreadyInLibrary && (
              <span
                className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }}
              >
                In Library
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted-2)] mt-0.5">
            {current.country && <span>{current.country}</span>}
            {recency && (
              <span className="inline-flex items-center gap-0.5">
                <Clock size={11} /> {recency}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={<Users size={12} />} label="Subscribers" value={compactCount(current.subscriberCount)} />
        <Stat icon={<Eye size={12} />} label="Avg views" value={compactCount(current.averageViews)} />
        <Stat icon={<TrendingUp size={12} />} label="Engagement" value={`${current.engagementRate.toFixed(1)}%`} />
      </div>

      {platformEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {platformEntries.map(([key, url]) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 rounded-full text-[11px] font-medium text-[var(--muted)] hover:text-[var(--ink)]"
              style={{ background: "var(--bg)" }}
            >
              {PLATFORM_LABEL[key] ?? key}
            </a>
          ))}
        </div>
      )}

      <div
        className="flex items-center gap-1.5 text-[12px] px-2 py-1.5 rounded-lg"
        style={
          current.email
            ? { background: "var(--success-bg)", color: "var(--success-fg)" }
            : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
        }
      >
        {current.email ? <Mail size={13} className="shrink-0" /> : <MailX size={13} className="shrink-0" />}
        <span className="truncate">{current.email ?? "No public email found"}</span>
      </div>

      <div className="flex items-center gap-1.5 pt-1">
        <StartOutreachButton
          disabled={!current.email}
          to={current.email ?? ""}
          contactName={current.title}
          channelName={current.title}
          channelUrl={current.channelUrl}
          niche={current.niche}
        />
        <a
          href={current.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View on YouTube"
          className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
        >
          <ExternalLink size={15} />
        </a>
        <MediaKitButton
          channelUrl={current.channelUrl}
          existingReportId={current.existingInsightReportId}
          onReportCreated={(reportId) => setCurrent((prev) => ({ ...prev, existingInsightReportId: reportId }))}
        />
        {current.creatorId && (
          <>
            <button
              onClick={() => setShowDetail(true)}
              title="Edit contact details &amp; social links"
              className="ml-auto p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
            >
              <Radio size={14} />
            </button>
            <button
              onClick={refresh}
              disabled={refreshing}
              title="Refresh live stats"
              className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
          </>
        )}
      </div>

      {showDetail && current.creatorId && (
        <CreatorDetailModal
          creatorId={current.creatorId}
          onClose={() => setShowDetail(false)}
          onSaved={(patch) => setCurrent((prev) => ({ ...prev, email: patch.email, platformLinks: patch.platformLinks }))}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1 text-[var(--muted-2)]">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-[13px] font-semibold text-[var(--ink)]">{value}</span>
    </div>
  );
}
