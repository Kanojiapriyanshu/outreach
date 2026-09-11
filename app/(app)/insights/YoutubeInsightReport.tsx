"use client";

import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Tags,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
  Watch,
  SquarePlay as Youtube,
} from "lucide-react";

type Tone = "success" | "danger" | "warning" | "excellent" | "good" | "average" | "weak" | "primary" | "muted" | "default";
type PlainObject = Record<string, unknown>;

type MetricCard = {
  key?: string;
  label?: string;
  value?: number | string | null;
  displayValue?: string;
  subLabel?: string;
  tone?: Tone;
  formula?: string;
  note?: string;
};

type CommentItem = {
  commentId?: string;
  authorDisplayName?: string;
  text?: string;
  likeCount?: number;
  replyCount?: number;
  publishedAt?: string | Date | null;
  labels?: string[];
  sentiment?: string;
};

type CommentBreakdown = {
  title?: string;
  totalComments?: number;
  sentiment?: { positive?: number; neutral?: number; negative?: number; label?: string };
  rows?: Array<{ key?: string; label?: string; count?: number; insight?: string; tone?: Tone }>;
  topCommentThemes?: Array<{ theme?: string; count?: number; interpretation?: string; type?: string }>;
  topComments?: CommentItem[];
  commentTabs?: Record<string, { key?: string; label?: string; count?: number; comments?: CommentItem[] }>;
};

type ReportData = {
  reportId?: string;
  reportType?: string;
  platform?: string;
  reportStatus?: string;
  generatedAt?: string | Date | null;
  hero?: PlainObject;
  profile?: PlainObject;
  channelOverview?: PlainObject;
  videoOverview?: PlainObject;
  overviewCards?: MetricCard[];
  kpiCards?: MetricCard[];
  youtubeStats?: { title?: string; cards?: MetricCard[]; notes?: string[] };
  performanceEstimateCards?: MetricCard[];
  performanceEstimates?: PlainObject;
  aiSummary?: PlainObject;
  aiInsights?: PlainObject;
  creatorFit?: PlainObject;
  influencerCategory?: PlainObject;
  topInterests?: string[];
  contentPerformanceSummary?: { title?: string; rows?: Array<{ label: string; value: string }> };
  performanceComparison?: { title?: string; summary?: string; rows?: Array<PlainObject> };
  commentBreakdown?: CommentBreakdown;
  lastVideosComparison?: PlainObject;
  scoreCards?: MetricCard[];
  finalVerdict?: PlainObject;
  estimatedWatchTime?: PlainObject;
  estimatedRevenue?: PlainObject;
  audienceMatch?: { score?: number; label?: string; note?: string };
  audienceDemographic?: PlainObject;
  otherDeliverables?: PlainObject[];
  dataAvailability?: { notes?: string[]; missingMetrics?: string[] } & PlainObject;
  videoMetrics?: PlainObject;
  channelMetrics?: PlainObject;
};

type Props = {
  apiResponse?: PlainObject | null;
  report?: ReportData | PlainObject | null;
  isLoading?: boolean;
  reportId?: string;
  shareToken?: string;
  isShareableView?: boolean;
  isBrandMode?: boolean;
};

const FALLBACK_REPORT_NAME = "youtube-insight";

// Same-origin: the report API and the shared-link page both live in this app.
const API_BASE_URL = "";

function apiPath(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${base}/${cleanPath}`;
}

function getPublicReportUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/insights/shared/${encodeURIComponent(token)}`;
}

function getStoredToken(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("adminToken") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

function extractShareToken(payload: unknown): string {
  if (!isObject(payload)) return "";
  const direct = payload.shareToken || payload.token || payload.publicToken;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (isObject(payload.data)) return extractShareToken(payload.data);
  return "";
}

function extractPublicUrl(payload: unknown): string {
  if (!isObject(payload)) return "";
  const direct = payload.publicUrl || payload.shareUrl || payload.url || payload.link;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (isObject(payload.data)) return extractPublicUrl(payload.data);
  return "";
}

async function createPublicInsightLink(report: ReportData, reportId?: string, existingToken?: string): Promise<string> {
  if (existingToken) return getPublicReportUrl(existingToken);

  const token = getStoredToken();
  const response = await fetch(apiPath(`/api/insights/${encodeURIComponent(reportId || report.reportId || "")}/share`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      reportId: reportId || report.reportId || "",
      frontendReport: report,
      report,
      sourceContext: "insight_os_report_share",
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result?.success === false) {
    const message = typeof result?.message === "string" && result.message.trim()
      ? result.message
      : "Unable to create public report link.";
    throw new Error(message);
  }

  const publicUrl = extractPublicUrl(result);
  if (publicUrl) return publicUrl;

  const newToken = extractShareToken(result);
  if (!newToken) throw new Error("Share token missing from backend response.");

  return getPublicReportUrl(newToken);
}


function isObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function text(value: unknown, fallback = "Not available"): string {
  if (!hasValue(value)) return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function compactNumber(value: unknown): string {
  const n = numberValue(value, 0);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function formatDate(value: unknown): string {
  if (!value) return "Not available";
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: unknown): string {
  if (!value) return "Not available";
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shorten(value: unknown, max = 160): string {
  const content = String(value || "").replace(/\s+/g, " ").trim();
  if (!content) return "Not available";
  if (content.length <= max) return content;
  return `${content.slice(0, max)}...`;
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function uniqueTextList(values: unknown[] = [], fallback: string[] = []): string[] {
  const source = values.length ? values : fallback;
  const map = new Map<string, string>();

  source.forEach((value) => {
    const item = String(value || "").replace(/\s+/g, " ").trim();
    if (!item) return;
    map.set(item.toLowerCase(), item);
  });

  return Array.from(map.values());
}

function stableKey(value: unknown, index: number, prefix = "item"): string {
  const cleanValue = String(value || prefix)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${cleanValue || prefix}-${index}`;
}

function metricCardKey(card: MetricCard, index: number): string {
  return stableKey(card.key || card.label || card.displayValue || index, index, "metric");
}

function formatPercent(value: unknown, decimals = 1): string {
  const n = numberValue(value, 0);
  return `${n.toFixed(decimals)}%`;
}

function getKpiIcon(key?: string): React.ComponentType<{ className?: string }> {
  const cleanKey = String(key || "").toLowerCase();
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    views: Eye,
    video_views: Eye,
    channel_total_views: BarChart3,
    likes: ThumbsUp,
    video_likes: ThumbsUp,
    comments: MessageCircle,
    video_comments: MessageCircle,
    channel_subscribers: Users,
    channel_total_videos: Video,
    video_duration: Clock3,
    estimated_watch_time: Watch,
    engagement_rate: Activity,
    final_ai_score: Sparkles,
    creator_score: Sparkles,
    comment_sentiment: Heart,
    estimated_ctr: TrendingUp,
    estimated_clicks: TrendingUp,
    estimated_share_rate: TrendingUp,
    estimated_shares: TrendingUp,
    estimated_conversion_rate: TrendingUp,
    estimated_conversions: TrendingUp,
  };
  return icons[cleanKey] || ShieldCheck;
}

function trendIcon(tone?: Tone): React.ReactNode {
  if (tone === "danger" || tone === "weak") return <TrendingDown className="h-3 w-3" />;
  return <TrendingUp className="h-3 w-3" />;
}


function toneClass(tone: Tone = "default"): string {
  const map: Record<Tone, string> = {
    success: "border-emerald-100 bg-emerald-50 text-emerald-700",
    danger: "border-rose-100 bg-rose-50 text-rose-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    excellent: "border-emerald-100 bg-emerald-50 text-emerald-700",
    good: "border-lime-100 bg-lime-50 text-lime-700",
    average: "border-amber-100 bg-amber-50 text-amber-700",
    weak: "border-rose-100 bg-rose-50 text-rose-700",
    primary: "border-blue-100 bg-blue-50 text-blue-700",
    muted: "border-slate-100 bg-slate-50 text-slate-600",
    default: "border-slate-200 bg-white text-slate-700",
  };
  return map[tone] || map.default;
}

function metricObject(value: unknown): PlainObject {
  return isObject(value) ? value : {};
}

function metricDisplayValue(value: unknown, fallback = "Not available"): string {
  const metric = metricObject(value);
  return text(metric.displayValue ?? metric.value, fallback);
}

function buildEstimateCard(
  estimates: PlainObject,
  key: string,
  label: string,
  metricKey: string
): MetricCard | null {
  const metric = metricObject(estimates[metricKey]);
  const displayValue = text(metric.displayValue ?? metric.value, "");
  if (!displayValue) return null;

  return {
    key,
    label,
    displayValue,
    formula: text(metric.formula, ""),
    note: text(metric.note, ""),
    tone: "warning",
  };
}

function buildPerformanceEstimateCardsFromRaw(estimates?: PlainObject): MetricCard[] {
  if (!isObject(estimates)) return [];

  return [
    buildEstimateCard(estimates, "estimated_ctr", "Estimated CTR", "estimatedCtr"),
    buildEstimateCard(estimates, "estimated_clicks", "Estimated Clicks", "estimatedClicks"),
    buildEstimateCard(estimates, "estimated_share_rate", "Estimated Share Rate", "estimatedShareRate"),
    buildEstimateCard(estimates, "estimated_shares", "Estimated Shares", "estimatedShares"),
    buildEstimateCard(estimates, "estimated_save_rate", "Estimated Save Rate", "estimatedSaveRate"),
    buildEstimateCard(estimates, "estimated_saves", "Estimated Saves", "estimatedSaves"),
    buildEstimateCard(estimates, "estimated_conversion_rate", "Estimated Conversion Rate", "estimatedConversionRate"),
    buildEstimateCard(estimates, "estimated_conversions", "Estimated Conversions", "estimatedConversions"),
  ].filter(Boolean) as MetricCard[];
}

function buildEstimatedWatchTimeFromRaw(estimates?: PlainObject): PlainObject {
  if (!isObject(estimates)) return {};

  return {
    retentionRate: estimates.estimatedRetentionRate,
    averageViewDurationSeconds: estimates.estimatedAverageViewDurationSeconds,
    totalWatchTimeMinutes: estimates.estimatedWatchTimeMinutes,
    totalWatchTimeHours: estimates.estimatedWatchTimeHours,
    formula: metricObject(estimates.estimatedWatchTimeMinutes).formula,
    note: metricObject(estimates.estimatedWatchTimeHours).note,
  };
}

function buildEstimatedRevenueFromRaw(report: ReportData, estimates?: PlainObject): PlainObject {
  if (!isObject(estimates)) return {};

  const low = metricObject(estimates.estimatedRevenueLow);
  const high = metricObject(estimates.estimatedRevenueHigh);
  const video = isObject(report.videoMetrics) ? report.videoMetrics : {};
  const range =
    hasValue(low.displayValue) || hasValue(high.displayValue)
      ? `${text(low.displayValue, "$0")} - ${text(high.displayValue, "$0")}`
      : "";

  return {
    estimatedRevenueRangeDisplay: range,
    rpmLow: estimates.rpmLow,
    rpmHigh: estimates.rpmHigh,
    totalVideoViewsDisplay: compactNumber(video.viewCount),
    source: "Estimated from public views and assumed RPM range.",
  };
}

function getNestedReport(input?: PlainObject | ReportData | null): ReportData {
  if (!input || !isObject(input)) return {};

  const objectInput = input as PlainObject;

  const frontendReport = objectInput["frontendReport"];
  if (isObject(frontendReport)) {
    return frontendReport as ReportData;
  }

  const dashboard = objectInput["dashboard"];
  if (isObject(dashboard)) {
    return dashboard as ReportData;
  }

  const nestedData = objectInput["data"];
  if (isObject(nestedData)) {
    return getNestedReport(nestedData as PlainObject);
  }

  return objectInput as unknown as ReportData;
}


function getCreatorAvatarUrl(report: ReportData): string {
  const profile = isObject(report.profile) ? report.profile : {};
  const channel = isObject(report.channelOverview) ? report.channelOverview : {};
  const hero = isObject(report.hero) ? report.hero : {};
  const video = isObject(report.videoOverview) ? report.videoOverview : {};
  const channelMetrics = isObject(report.channelMetrics) ? report.channelMetrics : {};

  return text(
    profile.avatarUrl ||
    channel.avatarUrl ||
    channel.thumbnailUrl ||
    hero.channelThumbnailUrl ||
    video.creatorAvatarUrl ||
    channelMetrics.thumbnailUrl,
    ""
  );
}

function CreatorAvatar({ report }: { report: ReportData }) {
  const [failed, setFailed] = useState(false);
  const profile = report.profile || {};
  const avatarUrl = getCreatorAvatarUrl(report);
  const initial = text(profile.name, "Y").charAt(0).toUpperCase();

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={text(profile.name, "YouTube Creator")}
        referrerPolicy="no-referrer"
        loading="eager"
        className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-red-50"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-red-50 text-xl font-black text-red-500 ring-4 ring-red-50">
      {initial}
    </div>
  );
}

function normalizeReport(props: Props): ReportData {
  const raw = getNestedReport((props.report || props.apiResponse || {}) as PlainObject);
  const channel = isObject(raw.channelOverview) ? raw.channelOverview : isObject(raw.channelMetrics) ? raw.channelMetrics : {};
  const profile = isObject(raw.profile) ? raw.profile : {};
  const video = isObject(raw.videoOverview) ? raw.videoOverview : isObject(raw.videoMetrics) ? raw.videoMetrics : {};
  const hero = isObject(raw.hero) ? raw.hero : {};
  const creator = isObject(raw.creatorFit) ? raw.creatorFit : isObject(raw.influencerCategory) ? raw.influencerCategory : {};
  const ai = isObject(raw.aiSummary) ? raw.aiSummary : isObject(raw.aiInsights) ? raw.aiInsights : {};
  const estimates = isObject(raw.performanceEstimates) ? raw.performanceEstimates : {};
  const estimateCards =
    Array.isArray(raw.performanceEstimateCards) && raw.performanceEstimateCards.length
      ? raw.performanceEstimateCards
      : buildPerformanceEstimateCardsFromRaw(estimates);

  return {
    ...raw,
    profile: {
      name: profile.name || channel.name || channel.title || hero.influencerName || video.creatorName || "YouTube Creator",
      handle: profile.handle || channel.handle || channel.customUrl || "",
      avatarUrl:
        profile.avatarUrl ||
        channel.avatarUrl ||
        channel.thumbnailUrl ||
        hero.channelThumbnailUrl ||
        video.creatorAvatarUrl ||
        raw.channelMetrics?.thumbnailUrl ||
        "",
      platform: "YouTube",
      country: profile.country || channel.country || "",
      subscriberCountDisplay: profile.subscriberCountDisplay || channel.subscribersDisplay || channel.subscriberCountDisplay || compactNumber(channel.subscribers || channel.subscriberCount),
      totalViewCountDisplay: profile.totalViewCountDisplay || channel.totalViewsDisplay || channel.totalViewCountDisplay || compactNumber(channel.totalViews || channel.totalViewCount),
      videoCountDisplay: profile.videoCountDisplay || channel.totalVideosDisplay || channel.videoCountDisplay || compactNumber(channel.totalVideos || channel.videoCount),
      sizeTier: profile.sizeTier || creator.sizeTier || "",
      authorityLevel: profile.authorityLevel || creator.authorityLevel || "",
      summary: profile.summary || ai.influencerSummary || ai.heroSummary || "Public YouTube creator insight generated from channel, video, comments, and recent uploads.",
    },
    channelOverview: {
      name: channel.name || channel.title || profile.name || hero.influencerName || "YouTube Creator",
      avatarUrl:
        channel.avatarUrl ||
        channel.thumbnailUrl ||
        profile.avatarUrl ||
        hero.channelThumbnailUrl ||
        video.creatorAvatarUrl ||
        raw.channelMetrics?.thumbnailUrl ||
        "",
      handle: channel.handle || channel.customUrl || profile.handle || "",
      channelUrl: channel.channelUrl || profile.channelUrl || hero.channelUrl || video.channelUrl || "",
      country: channel.country || profile.country || "",
      channelAge: channel.channelAge || profile.channelAge || "",
      subscribersDisplay: channel.subscribersDisplay || profile.subscriberCountDisplay || compactNumber(channel.subscribers || channel.subscriberCount),
      totalViewsDisplay: channel.totalViewsDisplay || profile.totalViewCountDisplay || compactNumber(channel.totalViews || channel.totalViewCount),
      totalVideosDisplay: channel.totalVideosDisplay || profile.videoCountDisplay || compactNumber(channel.totalVideos || channel.videoCount),
    },
    videoOverview: {
      title: video.title || hero.videoTitle || "YouTube Video",
      descriptionPreview: video.descriptionPreview || video.description || ai.performanceSummary || "Public video metadata and engagement signals are summarized here.",
      thumbnailUrl: video.thumbnailUrl || hero.thumbnailUrl || "",
      videoUrl: video.videoUrl || hero.livePublishedLink || "",
      channelUrl: video.channelUrl || hero.channelUrl || "",
      durationDisplay: video.durationDisplay || video.duration || "Not available",
      publishedOn: video.publishedOn || hero.publishDate || raw.generatedAt || null,
      contentFormat: video.contentFormat || creator.contentFormat || hero.videoType || "Public video",
      categoryName: video.categoryName || creator.youtubeCategory || creator.primaryCategory || "",
      tags: Array.isArray(video.tags) ? video.tags : [],
    },
    creatorFit: {
      primaryCategory: creator.primaryCategory || "General Creator",
      youtubeCategory: creator.youtubeCategory || video.categoryName || "",
      contentFormat: creator.contentFormat || video.contentFormat || "Public video",
      sizeTier: creator.sizeTier || profile.sizeTier || "",
      authorityLevel: creator.authorityLevel || profile.authorityLevel || "",
      bestUseCases: Array.isArray(creator.bestUseCases) ? creator.bestUseCases : ["Awareness", "Consideration", "Creator-fit testing"],
      notBestFor: Array.isArray(creator.notBestFor) ? creator.notBestFor : ["Exact sales proof without tracking"],
      positioning: creator.positioning || creator.recommendation || "Creator category is inferred from public metadata, topics, comments, and recent uploads.",
    },
    aiSummary: ai,
    overviewCards:
      raw.overviewCards ||
      raw.kpiCards ||
      (isObject(raw.youtubeStats) && Array.isArray(raw.youtubeStats.cards) ? (raw.youtubeStats.cards as MetricCard[]) : []),
    performanceEstimateCards: estimateCards,
    estimatedWatchTime:
      raw.estimatedWatchTime && Object.keys(raw.estimatedWatchTime).length
        ? raw.estimatedWatchTime
        : buildEstimatedWatchTimeFromRaw(estimates),
    estimatedRevenue:
      raw.estimatedRevenue && Object.keys(raw.estimatedRevenue).length
        ? raw.estimatedRevenue
        : buildEstimatedRevenueFromRaw(raw, estimates),
  };
}

function getSafeFileName(report: ReportData): string {
  const name = text(report.profile?.name || report.hero?.influencerName || FALLBACK_REPORT_NAME, FALLBACK_REPORT_NAME)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${name || FALLBACK_REPORT_NAME}-${report.reportId || Date.now()}.pdf`;
}

const PDF_CAPTURE_WIDTH = 1280;

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function waitForPdfImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();

      return new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
    })
  );
}

function expandPdfClone(root: HTMLElement): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("*"));

  elements.forEach((element) => {
    const className = String(element.getAttribute("class") || "");
    const computed = window.getComputedStyle(element);

    const shouldExpandY =
      element.dataset.pdfExpand === "true" ||
      className.includes("overflow-y-auto") ||
      className.includes("overflow-auto") ||
      className.includes("max-h-") ||
      ((computed.overflowY === "auto" || computed.overflowY === "scroll") &&
        element.scrollHeight > element.clientHeight + 2);

    const shouldExpandX =
      element.dataset.pdfExpand === "true" ||
      className.includes("overflow-x-auto") ||
      className.includes("overflow-auto") ||
      ((computed.overflowX === "auto" || computed.overflowX === "scroll") &&
        element.scrollWidth > element.clientWidth + 2);

    if (shouldExpandY || shouldExpandX) {
      element.style.overflow = "visible";
      element.style.overflowY = "visible";
      element.style.overflowX = "visible";
      element.style.maxHeight = "none";
      element.style.maxWidth = "none";

      if (shouldExpandY) {
        element.style.height = "auto";
        element.style.minHeight = `${element.scrollHeight}px`;
      }

      if (shouldExpandX) {
        element.style.width = `${Math.max(element.scrollWidth, element.clientWidth)}px`;
      }
    }

    if (className.includes("truncate") || className.includes("line-clamp")) {
      element.style.overflow = "visible";
      element.style.textOverflow = "clip";
      element.style.whiteSpace = "normal";
      element.style.display = "block";
      element.style.setProperty("-webkit-line-clamp", "unset");
      element.style.setProperty("-webkit-box-orient", "unset");
    }
  });
}

async function downloadReportPdf(report: ReportData): Promise<void> {
  const target = document.getElementById("youtube-insight-report-pdf");
  if (!target) throw new Error("Report UI element was not found.");

  const previousTitle = document.title;
  const safeTitle = getSafeFileName(report).replace(/\.pdf$/i, "");

  try {
    document.title = safeTitle;

    await document.fonts?.ready;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    window.print();
  } finally {
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  }
}

function StatusPill({ label, tone = "default" }: { label?: string; tone?: Tone }) {
  return <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", toneClass(tone))}>{label || "Published"}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      data-pdf-card="true"
      className={classNames("rounded-2xl border border-slate-200 bg-white", className)}
    >
      {children}
    </section>
  );
}

function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function HeaderProfile({
  report,
  reportId,
  shareToken,
  isShareableView = false,
  isBrandMode = false,
}: {
  report: ReportData;
  reportId?: string;
  shareToken?: string;
  isShareableView?: boolean;
  isBrandMode?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const profile = report.profile || {};
  const channel = report.channelOverview || {};
  const summary = text(profile.summary || report.aiSummary?.influencerSummary, "Public creator profile generated from YouTube channel and video data.");

  const handleDownload = async () => {
    if (downloading) return;

    const wasExpanded = expanded;

    setDownloading(true);
    setExpanded(true);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      await downloadReportPdf(report);
    } catch (error) {
      console.error(error);
      window.alert("PDF download failed. Please try again.");
    } finally {
      if (!wasExpanded) setExpanded(false);
      setDownloading(false);
    }
  };

  const copyLink = async () => {
    if (copying) return;

    try {
      setCopying(true);
      setCopied(false);
      const publicLink = await createPublicInsightLink(report, reportId, shareToken);

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicLink);
      } else {
        const input = document.createElement("input");
        input.value = publicLink;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Unable to copy public report link.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="border-b border-slate-100 bg-white px-6 py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <CreatorAvatar report={report} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-950">{text(profile.name, "YouTube Creator")}</h1>
              <ShieldCheck className="h-5 w-5 fill-blue-500 text-blue-500" />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {hasValue(profile.handle) ? <span>{String(profile.handle)}</span> : null}
              <span>YouTube</span>
              {hasValue(profile.country) ? <span>· {String(profile.country)}</span> : null}
              {hasValue(profile.sizeTier) ? <span>· {String(profile.sizeTier)}</span> : null}
            </div>
            <div className="mt-4 grid max-w-3xl gap-2 text-xs sm:grid-cols-3">
              <MiniStat label="Subscribers" value={text(channel.subscribersDisplay || profile.subscriberCountDisplay)} />
              <MiniStat label="Channel Views" value={text(channel.totalViewsDisplay || profile.totalViewCountDisplay)} />
              <MiniStat label="Total Videos" value={text(channel.totalVideosDisplay || profile.videoCountDisplay)} />
            </div>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-500">
              {expanded ? summary : shorten(summary, 260)}
              {summary.length > 260 ? (
                <button type="button" className="ml-1 font-semibold text-slate-900 hover:underline" onClick={() => setExpanded((value) => !value)}>
                  {expanded ? "show less" : "read more..."}
                </button>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          <StatusPill label={String(report.reportStatus || "Published")} tone="success" />

          <div data-pdf-exclude="true" className="flex flex-wrap items-center gap-2">

            {!isBrandMode ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Download className="h-4 w-4" /> {downloading ? "Preparing PDF..." : "Download PDF"}
              </button>
            ) : null}

            {!isShareableView ? (
              <button
                type="button"
                onClick={copyLink}
                disabled={copying}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Copy className="h-4 w-4" />
                {copying ? "Creating link..." : copied ? "Copied" : "Copy Link"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-slate-400">{label}</div>
      <div className="mt-1 font-bold text-slate-900">{value}</div>
    </div>
  );
}

function buildPublicOverviewCards(report: ReportData): MetricCard[] {
  const channel = isObject(report.channelOverview) ? report.channelOverview : {};
  const video = isObject(report.videoOverview) ? report.videoOverview : {};
  const channelMetrics = isObject(report.channelMetrics) ? report.channelMetrics : {};
  const videoMetrics = isObject(report.videoMetrics) ? report.videoMetrics : {};
  const watch = isObject(report.estimatedWatchTime) ? report.estimatedWatchTime : {};

  const subscribers = channel.subscribers || channel.subscriberCount || channelMetrics.subscriberCount;
  const totalViews = channel.totalViews || channel.totalViewCount || channelMetrics.totalViewCount;
  const totalVideos = channel.totalVideos || channel.videoCount || channelMetrics.videoCount;
  const videoViews = video.views || video.viewCount || videoMetrics.viewCount;
  const likes = video.likes || video.likeCount || videoMetrics.likeCount;
  const comments = video.comments || video.commentCount || videoMetrics.commentCount;
  const duration = video.durationDisplay || video.duration || videoMetrics.durationDisplay;
  const watchHours = metricDisplayValue((watch.totalWatchTimeHours as PlainObject) || watch.estimatedWatchTimeHours, "Not available");

  return [
    {
      key: "channel_subscribers",
      label: "Total Subscribers",
      displayValue: text(channel.subscribersDisplay || channel.subscriberCountDisplay || compactNumber(subscribers)),
      subLabel: "Channel subscribers",
      tone: hasValue(subscribers) ? "success" : "muted",
    },
    {
      key: "channel_total_views",
      label: "Channel Views",
      displayValue: text(channel.totalViewsDisplay || channel.totalViewCountDisplay || compactNumber(totalViews)),
      subLabel: "All public channel views",
      tone: hasValue(totalViews) ? "success" : "muted",
    },
    {
      key: "channel_total_videos",
      label: "Total Videos",
      displayValue: text(channel.totalVideosDisplay || channel.videoCountDisplay || compactNumber(totalVideos)),
      subLabel: "Public uploaded videos",
      tone: hasValue(totalVideos) ? "success" : "muted",
    },
    {
      key: "video_views",
      label: "Video Views",
      displayValue: text(video.viewsDisplay || video.viewCountDisplay || compactNumber(videoViews)),
      subLabel: "Current video views",
      tone: hasValue(videoViews) ? "success" : "muted",
    },
    {
      key: "video_likes",
      label: "Video Likes",
      displayValue: text(video.likesDisplay || video.likeCountDisplay || compactNumber(likes)),
      subLabel: "Public like count",
      tone: hasValue(likes) ? "success" : "muted",
    },
    {
      key: "video_comments",
      label: "Video Comments",
      displayValue: text(video.commentsDisplay || video.commentCountDisplay || compactNumber(comments)),
      subLabel: "Public comment count",
      tone: hasValue(comments) ? "success" : "muted",
    },
    {
      key: "video_duration",
      label: "Video Duration",
      displayValue: text(duration),
      subLabel: "Public duration",
      tone: hasValue(duration) ? "primary" : "muted",
    },
    {
      key: "estimated_watch_time",
      label: "Est. Watch Time",
      displayValue: watchHours === "Not available" ? watchHours : `${watchHours} hrs`,
      subLabel: "Formula estimate",
      tone: watchHours === "Not available" ? "muted" : "warning",
    },
  ];
}

function YouTubePublicOverview({ report }: { report: ReportData }): React.ReactElement {
  const youtubeStats = isObject(report.youtubeStats) ? report.youtubeStats : {};
  const backendCards = Array.isArray(youtubeStats.cards)
    ? (youtubeStats.cards as MetricCard[])
    : report.overviewCards || report.kpiCards || [];
  const cards = backendCards.length ? backendCards.slice(0, 8) : buildPublicOverviewCards(report);
  const notes = Array.isArray(youtubeStats.notes) ? (youtubeStats.notes as string[]) : [];

  return (
    <Card>
      <CardHeader
        title="YouTube Public Overview"
        subtitle="Public video + channel metrics from the YouTube link."
        right={<Youtube className="h-4 w-4 text-red-500" />}
      />

      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.length ? (
          cards.slice(0, 8).map((card, index) => {
            const Icon = getKpiIcon(card.key);
            const tone = card.tone || "success";

            return (
              <div key={metricCardKey(card, index)} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-slate-500">{text(card.label, "Metric")}</div>
                  <Icon className="h-4 w-4 text-slate-600" />
                </div>

                <div className="mt-8 text-lg font-bold text-slate-950">
                  {text(card.displayValue || card.value)}
                </div>

                <div
                  className={classNames(
                    "mt-2 inline-flex items-center gap-1 text-xs",
                    tone === "danger" || tone === "weak"
                      ? "text-rose-600"
                      : tone === "warning" || tone === "average"
                        ? "text-amber-600"
                        : tone === "primary"
                          ? "text-blue-600"
                          : "text-emerald-600"
                  )}
                >
                  {trendIcon(tone)}
                  {text(card.subLabel || card.note, "Public data")}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState text="No public YouTube overview metrics available." />
        )}
      </div>

      {notes.length ? (
        <div className="border-t border-slate-100 px-5 py-3">
          <div className="space-y-1">
            {notes.slice(0, 2).map((note, index) => (
              <p key={stableKey(note, index, "youtube-note")} className="text-[11px] leading-4 text-slate-400">
                {note}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function VideoHero({ report }: { report: ReportData }) {
  const video: PlainObject = isObject(report.videoOverview) ? report.videoOverview : {};

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[320px_1fr]">
        <div className="relative h-64 bg-slate-100 md:h-full">
          {video.thumbnailUrl ? (
            <img
              src={String(video.thumbnailUrl)}
              alt={text(video.title)}
              className="h-full w-full object-cover"
            />
          ) : null}

          <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded bg-black/80 px-2 py-1 text-xs font-semibold text-white">
            <Youtube className="h-3 w-3 fill-red-500 text-red-500" />
            YouTube
          </div>

          <div className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-1 text-xs font-semibold text-white">
            {text(video.durationDisplay)}
          </div>
        </div>

        <div className="p-5">
          <h2 className="text-lg font-black leading-6 text-slate-950">
            {text(video.title, "YouTube Video")}
          </h2>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            {shorten(video.descriptionPreview, 230)}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <StatusPill label={String(video.contentFormat || "Public Video")} tone="primary" />

            {hasValue(video.categoryName) ? (
              <StatusPill label={String(video.categoryName)} tone="muted" />
            ) : null}

            <StatusPill label={formatDate(video.publishedOn)} tone="default" />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <ExternalButton href={String(video.videoUrl || "")}>View Video</ExternalButton>
            <ExternalButton href={String(video.channelUrl || "")}>View Channel</ExternalButton>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ExternalButton({ href, children }: { href?: string; children: React.ReactNode }) {
  return (
    <a href={href || "#"} target="_blank" rel="noreferrer" className={classNames("inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700", !href && "pointer-events-none opacity-50")}>
      {children} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function MetricTile({ card, compact = false }: { card: MetricCard; compact?: boolean }) {
  const description = text(card.subLabel || card.note, "");
  const formula = text(card.formula, "");

  return (
    <div className={classNames("rounded-xl border border-slate-200 bg-white", compact ? "p-3" : "p-4")}>
      <div className="text-xs font-medium text-slate-500">{text(card.label, "Metric")}</div>
      <div className={classNames("mt-3 font-black text-slate-950", compact ? "text-lg" : "text-2xl")}>
        {text(card.displayValue || card.value)}
      </div>
    </div>
  );
}

function AiSummary({ report }: { report: ReportData }) {
  const ai = report.aiSummary || {};
  const verdict = report.finalVerdict || {};
  const finalScore = Math.round(numberValue(verdict.finalScore || report.audienceMatch?.score));
  const strengths = uniqueTextList(Array.isArray(ai.strengths) ? ai.strengths : []);
  const risks = uniqueTextList(Array.isArray(ai.risks) ? ai.risks : []);
  const actions = uniqueTextList(Array.isArray(ai.nextActions) ? ai.nextActions : []);
  const details = [
    { title: "Performance", value: text(ai.performanceSummary) },
    { title: "Audience", value: text(ai.audienceBehaviorInsight) },
    { title: "Comments", value: text(ai.commentQualityInsight) },
    { title: "Risk check", value: text(ai.riskInsight) },
  ];

  return (
    <Card className="overflow-hidden border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-600">
              <Sparkles className="h-3.5 w-3.5" />
              AI Summary
            </div>
            <h2 className="mt-3 text-base font-black text-slate-950">
              {text(ai.brandDecision || verdict.verdict || ai.recommendation, "Brand decision unavailable")}
            </h2>
          </div>

          <StatusPill
            label={`${finalScore}/100`}
            tone={finalScore >= 80 ? "excellent" : finalScore >= 60 ? "good" : "warning"}
          />
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          {text(ai.heroSummary || ai.influencerSummary || ai.performanceSummary)}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SignalList title="Strengths" items={strengths.slice(0, 3)} icon="check" />
          <SignalList title="Risks" items={risks.slice(0, 3)} icon="warning" />
          <SignalList title="Next Actions" items={actions.slice(0, 3)} icon="spark" />
        </div>
      </div>

      <div className="border-t border-amber-100 bg-white/70 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">
            Brand decision details
          </h3>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {details.map((item, index) => (
            <DetailBlock
              key={stableKey(item.title, index, "ai-detail")}
              title={item.title}
              value={item.value}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function SignalList({ title, items, icon }: { title: string; items: string[]; icon: "check" | "warning" | "spark" }) {
  const Icon = icon === "warning" ? AlertTriangle : icon === "spark" ? Sparkles : CheckCircle2;
  const tone = icon === "warning" ? "text-amber-500" : icon === "spark" ? "text-blue-500" : "text-emerald-500";
  const safeItems = uniqueTextList(items, ["Not available"]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-3 space-y-2">
        {safeItems.map((item, index) => (
          <div key={stableKey(item, index, title)} className="flex gap-2 text-xs leading-5 text-slate-600">
            <Icon className={classNames("mt-0.5 h-3.5 w-3.5 shrink-0", tone)} /> {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">{value}</p>
    </div>
  );
}

function EstimateGrid({ report }: { report: ReportData }) {
  const cards = report.performanceEstimateCards || [];
  return (
    <Card>
      <CardHeader
        title="Estimated Brand Metrics"
        right={<TrendingUp className="h-4 w-4 text-amber-600" />}
      />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.length ? (
          cards.slice(0, 8).map((card, index) => (
            <div key={metricCardKey(card, index)} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-slate-500">{text(card.label, "Metric")}</div>
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-7 text-lg font-bold text-slate-950">{text(card.displayValue || card.value)}</div>
            </div>
          ))
        ) : (
          <EmptyState text="No estimates available." />
        )}
      </div>
    </Card>
  );
}


function CreatorFit({ report }: { report: ReportData }) {
  const creator = report.creatorFit || report.influencerCategory || {};
  const topics = Array.isArray(report.topInterests) ? report.topInterests : [];
  const best = uniqueTextList(Array.isArray(creator.bestUseCases) ? creator.bestUseCases : []);
  const notBest = uniqueTextList(Array.isArray(creator.notBestFor) ? creator.notBestFor : []);
  const uniqueTopics = uniqueTextList(topics, ["No public tags/topics available"]).slice(0, 28);
  return (
    <Card>
      <CardHeader title="Creator Fit" subtitle={text(creator.positioning, "Creator category is inferred from public metadata and comments.")} right={<Tags className="h-4 w-4 text-slate-500" />} />
      <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={String(creator.primaryCategory || "General Creator")} tone="primary" />
            {hasValue(creator.contentFormat) ? <StatusPill label={String(creator.contentFormat)} tone="muted" /> : null}
            {hasValue(creator.sizeTier) ? <StatusPill label={String(creator.sizeTier)} tone="success" /> : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SignalList title="Best for" items={best.slice(0, 5)} icon="check" />
            <SignalList title="Avoid for" items={notBest.slice(0, 5)} icon="warning" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Topics</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {uniqueTopics.map((topic, index) => (
              <span
                key={stableKey(topic, index, "topic")}
                className="rounded-full bg-white px-3 py-1 text-xs text-slate-500"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function CommentBreakdown({ data }: { data?: CommentBreakdown }) {
  const [activeTab, setActiveTab] = useState("themes");
  const tabs = data?.commentTabs || {};
  const tabList = [
    { key: "themes", label: "Themes", count: data?.topCommentThemes?.length || 0 },
    ...Object.entries(tabs).map(([key, value]) => ({
      key,
      label: value.label || key,
      count: value.count || value.comments?.length || 0,
    })),
  ];
  const activeComments = tabs[activeTab]?.comments || [];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Comment Breakdown" right={<StatusPill label={`${compactNumber(data?.totalComments)} analyzed`} tone="muted" />} />
      <div className="space-y-5 px-5 pb-5">
        <div className="grid gap-3 md:grid-cols-3">
          <SentimentCard label="Positive" value={numberValue(data?.sentiment?.positive)} tone="success" />
          <SentimentCard label="Neutral" value={numberValue(data?.sentiment?.neutral)} tone="muted" />
          <SentimentCard label="Negative" value={numberValue(data?.sentiment?.negative)} tone="danger" />
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          {(data?.rows || []).map((row) => <div key={row.key || row.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex justify-between gap-2 text-xs font-bold text-slate-800"><span>{row.label}</span><span>{compactNumber(row.count)}</span></div><p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">{row.insight}</p></div>)}
        </div>
        <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {tabList.map((tab) => <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={classNames("shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold", activeTab === tab.key ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600")}>{tab.label} <span className="opacity-70">{compactNumber(tab.count)}</span></button>)}
          </div>
          {activeTab === "themes" ? <ThemeGrid themes={data?.topCommentThemes || []} /> : <CommentGrid comments={activeComments} />}
        </div>
      </div>
    </Card>
  );
}

function SentimentCard({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const bar = tone === "success" ? "bg-emerald-500" : tone === "danger" ? "bg-rose-500" : "bg-slate-400";
  return (
    <div className={classNames("rounded-2xl border p-4", toneClass(tone))}>
      <div className="flex items-center justify-between"><span className="text-xs font-bold">{label}</span><span className="text-base font-black">{value.toFixed(1)}%</span></div>
      <div className="mt-3 h-1.5 rounded-full bg-white/70"><div className={classNames("h-1.5 rounded-full", bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

function ThemeGrid({ themes }: { themes: Array<{ theme?: string; count?: number; interpretation?: string }> }) {
  return (
    <div data-pdf-expand="true" className="mt-3 grid max-h-[28rem] gap-3 overflow-y-auto lg:grid-cols-2">
      {themes.length ? themes.slice(0, 12).map((theme, index) => <div key={`${theme.theme}-${index}`} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><b className="text-xs text-slate-900">“{theme.theme || "Audience theme"}”</b>{hasValue(theme.count) ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{compactNumber(theme.count)}</span> : null}</div><p className="mt-2 text-[11px] leading-4 text-slate-500">{theme.interpretation || "No interpretation available."}</p></div>) : <EmptyState text="No comment themes found." />}
    </div>
  );
}

function CommentGrid({ comments }: { comments: CommentItem[] }) {
  return (
    <div data-pdf-expand="true" className="mt-3 grid max-h-[32rem] gap-3 overflow-y-auto lg:grid-cols-2">
      {comments.length ? comments.slice(0, 10).map((comment, index) => <div key={comment.commentId || index} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div className="min-w-0"><b className="block truncate text-xs text-slate-900">{comment.authorDisplayName || "YouTube user"}</b><span className="mt-1 block text-[11px] text-slate-400">{compactNumber(comment.likeCount)} likes · {compactNumber(comment.replyCount)} replies</span></div><StatusPill label={comment.sentiment || "neutral"} tone={comment.sentiment === "positive" ? "success" : comment.sentiment === "negative" ? "danger" : "muted"} /></div><p className="mt-3 text-xs leading-5 text-slate-700">“{shorten(comment.text, 240)}”</p></div>) : <EmptyState text="No comments in this bucket." />}
    </div>
  );
}

function MiniSparkline({ positive = true }: { positive?: boolean }): React.ReactElement {
  const color = positive ? "#22c55e" : "#fb7185";
  const points = positive
    ? "0,28 12,28 22,26 34,27 44,22 58,20 68,15 82,18 94,10 110,12"
    : "0,10 12,12 22,17 34,13 44,18 58,20 68,23 82,19 94,26 110,28";

  return (
    <svg viewBox="0 0 110 36" className="h-8 w-24" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
      <path d={`M${points.replace(/ /g, " L")} L110 36 L0 36 Z`} fill={positive ? "rgba(34,197,94,.14)" : "rgba(251,113,133,.14)"} />
    </svg>
  );
}

function RecentVideos({ data }: { data?: PlainObject }) {
  const rows = Array.isArray(data?.rows) ? (data.rows as PlainObject[]) : [];
  const tabs = Array.isArray(data?.tabs) && data.tabs.length ? (data.tabs as string[]) : ["Views", "Likes", "Comment"];
  const [active, setActive] = useState(tabs[0] || "Views");
  const activeKey = active.toLowerCase().includes("like") ? "likes" : active.toLowerCase().includes("comment") ? "comments" : "views";

  const averageDisplay =
    activeKey === "likes"
      ? text(data?.averageLikesDisplay || (hasValue(data?.averageLikes) ? compactNumber(data?.averageLikes) : ""), "")
      : activeKey === "comments"
        ? text(data?.averageCommentsDisplay || (hasValue(data?.averageComments) ? compactNumber(data?.averageComments) : ""), "")
        : text(data?.averageViewsDisplay || (hasValue(data?.averageViews) ? compactNumber(data?.averageViews) : ""), "");

  function getMetricDisplay(row: PlainObject): string {
    if (activeKey === "likes") return text(row.likeCountDisplay || compactNumber(row.likeCount));
    if (activeKey === "comments") return text(row.commentCountDisplay || compactNumber(row.commentCount));
    return text(row.viewCountDisplay || compactNumber(row.viewCount));
  }

  function getMetricChange(row: PlainObject): number | null {
    const raw =
      activeKey === "likes"
        ? row.likesChangePercentage
        : activeKey === "comments"
          ? row.commentsChangePercentage
          : row.viewsChangePercentage ?? row.changePercentage;
    return hasValue(raw) ? numberValue(raw) : null;
  }

  function getMetricTrend(row: PlainObject): string {
    if (activeKey === "likes") return text(row.likesTrend, "neutral");
    if (activeKey === "comments") return text(row.commentsTrend, "neutral");
    return text(row.viewsTrend || row.trend, "neutral");
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{text(data?.title, "Recent Uploads Comparison")}</h3>
        </div>
        <Video className="h-4 w-4 text-slate-500" />
      </div>

      <div className="mt-6 text-4xl font-semibold tracking-tight text-slate-950">
        {averageDisplay || "Not available"}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab, index) => (
          <button
            key={stableKey(tab, index, "recent-tab")}
            type="button"
            onClick={() => setActive(tab)}
            className={classNames(
              "rounded px-3 py-1.5 text-xs font-semibold",
              active === tab ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <div className="space-y-3">
          {rows.length ? (
            rows.slice(0, 10).map((row, index) => {
              const change = getMetricChange(row);
              const trend = getMetricTrend(row);
              const positive = trend === "up" || (trend === "neutral" && numberValue(change) >= 0);
              const metricDisplay = getMetricDisplay(row);

              return (
                <div key={stableKey(row.videoId || row.title || index, index, "recent-video")} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[36px_1fr_auto_auto]">
                  {row.thumbnailUrl ? (
                    <img src={String(row.thumbnailUrl)} alt={text(row.title, "video")} className="h-9 w-9 rounded object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded bg-slate-100" />
                  )}

                  <div className="min-w-0 text-slate-700">
                    <div className="truncate font-medium">{text(row.title || row.url)}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{text(row.dateLabel || formatDate(row.publishedAt) || row.durationDisplay, "Not available")}</div>
                  </div>

                  <div className="hidden sm:block">
                    <MiniSparkline positive={positive} />
                  </div>

                  <span className={classNames("rounded px-2 py-1 font-semibold", positive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500")}>
                    {metricDisplay}
                    {change !== null ? <span className="ml-1">{positive ? "+" : ""}{change.toFixed(1)}%</span> : null}
                  </span>
                </div>
              );
            })
          ) : (
            <EmptyState text="No recent uploads found." />
          )}
        </div>
      </div>
    </Card>
  );
}


function AudienceGauge({ data }: { data?: { score?: number; label?: string; note?: string } }) {
  const score = Math.max(0, Math.min(100, numberValue(data?.score, 60)));
  const angle = 180 - score * 1.8;
  const meta = score >= 80 ? { label: "Audience Match Score is Excellent", short: "High", color: "#28A745" } : score >= 60 ? { label: "Audience Match Score is Good", short: "Good", color: "#FFBF00" } : score >= 40 ? { label: "Audience Match Score is Average", short: "Average", color: "#FF8751" } : { label: "Audience Match Score is Low", short: "Low", color: "#EF5350" };
  const polar = (cx: number, cy: number, r: number, deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy - r * Math.sin((deg * Math.PI) / 180) });
  const arc = (cx: number, cy: number, r: number, start: number, end: number) => { const s = polar(cx, cy, r, start); const e = polar(cx, cy, r, end); return `M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`; };
  const indicator = polar(150, 146, 102, angle);
  const segments = [
    { label: "Low", start: 180, end: 109, color: "#EF5350" },
    { label: "Average", start: 102, end: 73, color: "#FF8751" },
    { label: "Good", start: 66, end: 37, color: "#FFBF00" },
    { label: "High", start: 30, end: 0, color: "#28A745" },
  ];
  return (
    <Card className="p-5">
      <h3 className="text-[0.7345rem] font-semibold leading-[0.94438rem] tracking-[-0.02625rem] text-[#7A7A7A]">Audience Match score</h3>
      <div className="mx-auto mt-6 w-full max-w-[17rem]">
        <div className="relative h-[16.4rem] w-full">
          <svg viewBox="0 0 300 235" className="block w-full overflow-visible" aria-hidden>
            {segments.map((s) => <path key={s.label} d={arc(150, 146, 102, s.start, s.end)} fill="none" stroke={s.color} strokeWidth="14" strokeLinecap="round" />)}
            <path d={arc(150, 146, 74, 170, 10)} fill="none" stroke="#9B9B9B" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.1 13.2" />
            <circle cx={indicator.x} cy={indicator.y} r="10.5" fill={meta.color} />
            <circle cx={indicator.x} cy={indicator.y} r="5" fill="white" />
          </svg>
          <div className="absolute inset-x-0 top-[8.2rem] text-center">
            <div className="text-[2.51838rem] font-semibold leading-[3.04306rem] tracking-[-0.10494rem] text-[#242424]">{Math.round(score)}%</div>
            <div className="mx-auto mt-2 max-w-[13.25rem] text-[0.71775rem] font-bold leading-[1.07656rem] text-[#242424]">{meta.label}</div>
            <p className="mx-auto mt-2.5 max-w-[13.4rem] text-center text-[0.628rem] font-medium leading-[0.89713rem] text-[#969696]">{data?.note || "This score shows fit between creator, topic, comments, and engagement."}</p>
          </div>
        </div>
        <div className="mx-auto mt-4 flex w-fit max-w-full flex-wrap justify-center gap-x-3 gap-y-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
          {segments.map((s) => <span key={s.label} className={classNames("inline-flex items-center gap-1.5 whitespace-nowrap text-[0.53831rem] leading-[0.71775rem] text-[#969696]", meta.short === s.label ? "font-semibold text-slate-700" : "font-normal")}><span className="h-[0.46rem] w-[0.46rem] rounded-full" style={{ backgroundColor: s.color }} />{s.label}</span>)}
        </div>
      </div>
    </Card>
  );
}

function SidebarCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <Card className="p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">{title}</h3><Icon className="h-4 w-4 text-slate-500" /></div>{children}</Card>;
}

function WatchTimeCard({ data }: { data?: PlainObject }) {
  const hours = metricDisplayValue(data?.totalWatchTimeHours);
  const retention = metricDisplayValue(data?.retentionRate);
  const avgDuration = metricDisplayValue(data?.averageViewDurationSeconds);
  const minutes = metricDisplayValue(data?.totalWatchTimeMinutes);

  return (
    <SidebarCard title="Estimated Watch Time" icon={Watch}>
      <div className="text-2xl font-black text-slate-950">{hours}</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Estimated from public views, duration, and retention assumptions.
      </p>
      <SideRow label="Retention" value={retention} />
      <SideRow label="Avg. View Duration" value={avgDuration} />
      <SideRow label="Watch Minutes" value={minutes} />
    </SidebarCard>
  );
}

function RevenueCard({ data }: { data?: PlainObject }) {
  return (
    <SidebarCard title="Estimated Revenue" icon={DollarSign}>
      <div className="text-2xl font-black text-slate-950">{text(data?.estimatedRevenueRangeDisplay)}</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        {text(data?.source, "Estimated from public views and assumed RPM range.")}
      </p>
      <SideRow label="Views" value={text(data?.totalVideoViewsDisplay)} />
      <SideRow label="RPM" value={`${text(data?.rpmLow)} - ${text(data?.rpmHigh)}`} />
    </SidebarCard>
  );
}

function DonutChart({ data = [] }: { data?: Array<{ label?: string; value?: number }> }): React.ReactElement {
  const hasData = data.length > 0;
  const first = hasData ? numberValue(data[0]?.value, 0) : 0;
  const second = hasData ? numberValue(data[1]?.value, 0) : 0;
  const third = hasData ? numberValue(data[2]?.value, Math.max(0, 100 - first - second)) : 0;

  return (
    <div className="flex items-center gap-5">
      {hasData ? (
        <div className="h-24 w-24 rounded-full" style={{ background: `conic-gradient(#93c5fd 0 ${first}%, #f9a8d4 ${first}% ${first + second}%, #cbd5e1 ${first + second}% 100%)` }}>
          <div className="m-auto h-12 w-12 translate-y-6 rounded-full bg-white" />
        </div>
      ) : (
        <div className="h-24 w-24 rounded-full bg-slate-100" />
      )}

      <div className="flex-1 space-y-3 text-xs text-slate-500">
        {hasData ? (
          <>
            <div className="flex justify-between">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-300" /> {text(data[0]?.label, "Positive")}</span>
              <b>{first.toFixed(1)}%</b>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-pink-300" /> {text(data[1]?.label, "Neutral")}</span>
              <b>{second.toFixed(1)}%</b>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-slate-300" /> {text(data[2]?.label, "Negative")}</span>
              <b>{third.toFixed(1)}%</b>
            </div>
          </>
        ) : (
          <div className="text-xs leading-5 text-slate-500">Sentiment fallback is not available.</div>
        )}
      </div>
    </div>
  );
}

function AudienceSignalsCard({ data }: { data?: PlainObject }) {
  const topCountries = Array.isArray(data?.topCountries) ? (data.topCountries as PlainObject[]) : [];
  const sentiment = Array.isArray(data?.sentimentFallback)
    ? (data.sentimentFallback as Array<{ label?: string; value?: number }>)
    : [];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Audience Signals</h3>
        </div>
        <Users className="h-4 w-4 text-slate-500" />
      </div>

      <div className="mt-5">
        <DonutChart data={sentiment} />
      </div>

      <div className="mt-5 space-y-2">
        {topCountries.length > 0 ? (
          topCountries.slice(0, 5).map((country, index) => (
            <SideRow
              key={`${text(country.country)}-${index}`}
              label={text(country.country)}
              value={`${numberValue(country.percentage).toFixed(0)}%`}
            />
          ))
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Top country is not available from public data.
          </div>
        )}
      </div>
    </Card>
  );
}


function SideRow({ label, value }: { label: string; value: string }) {
  return <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">{label}</span><b className="text-slate-900">{value}</b></div>;
}

function ScoreBreakdown({ cards = [] }: { cards?: MetricCard[] }) {
  if (!cards.length) return null;
  return <Card><CardHeader title="Score Breakdown" /><div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card, index) => (
    <MetricTile key={metricCardKey(card, index)} card={card} compact />
  ))}</div></Card>;
}

function Notes({ notes = [] }: { notes?: string[] }) {
  if (!notes.length) return null;
  return <Card className="p-5"><h3 className="text-sm font-bold text-slate-900">Public Data Notes</h3><div className="mt-4 space-y-2">{uniqueTextList(notes).map((note, index) => (
    <div key={stableKey(note, index, "note")} className="flex gap-2 text-xs leading-5 text-slate-500">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      {note}
    </div>
  ))}</div></Card>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs leading-5 text-slate-500">{text}</div>;
}

function FullPageSkeleton() {
  return <main className="min-h-screen bg-white"><div className="mx-auto max-w-[1180px] px-6 py-10"><div className="h-32 animate-pulse rounded-3xl bg-slate-100" /><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]"><div className="space-y-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-2xl bg-slate-100" />)}</div><div className="space-y-5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-100" />)}</div></div></div>
    <style jsx global>{`
  @page {
    size: A4;
    margin: 10mm;
  }

  @media print {
    html,
    body {
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      background: #ffffff !important;
    }

    body {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    [data-pdf-exclude="true"] {
      display: none !important;
    }

    #youtube-insight-report-pdf {
      width: 100% !important;
      min-height: auto !important;
      background: #ffffff !important;
      overflow: visible !important;
    }

    #youtube-insight-report-pdf > div {
      max-width: 100% !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    #youtube-insight-report-pdf [data-pdf-card="true"] {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      box-shadow: none !important;
    }

    #youtube-insight-report-pdf [data-pdf-expand="true"] {
      max-height: none !important;
      height: auto !important;
      overflow: visible !important;
    }

    #youtube-insight-report-pdf .overflow-y-auto,
    #youtube-insight-report-pdf .overflow-x-auto,
    #youtube-insight-report-pdf .overflow-auto {
      overflow: visible !important;
      max-height: none !important;
    }

    #youtube-insight-report-pdf .truncate {
      overflow: visible !important;
      text-overflow: unset !important;
      white-space: normal !important;
    }

    #youtube-insight-report-pdf .line-clamp-2,
    #youtube-insight-report-pdf .line-clamp-3 {
      display: block !important;
      overflow: visible !important;
      -webkit-line-clamp: unset !important;
      -webkit-box-orient: unset !important;
    }

    #youtube-insight-report-pdf .max-w-7xl {
      max-width: 100% !important;
    }

    #youtube-insight-report-pdf .lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_340px\\] {
      grid-template-columns: minmax(0, 1fr) 300px !important;
    }

    #youtube-insight-report-pdf .xl\\:grid-cols-\\[330px_minmax\\(0\\,1fr\\)\\] {
      grid-template-columns: 300px minmax(0, 1fr) !important;
    }

    #youtube-insight-report-pdf a {
      text-decoration: none !important;
    }
  }
`}</style>
  </main>;
}

export default function YoutubeInsightReport({
  apiResponse,
  report: reportProp,
  isLoading = false,
  reportId,
  shareToken,
  isShareableView = false,
  isBrandMode = false,
}: Props): React.ReactElement {
  const report = useMemo(() => normalizeReport({ apiResponse, report: reportProp }), [apiResponse, reportProp]);
  if (isLoading) return <FullPageSkeleton />;

  return (
    <main id="youtube-insight-report-pdf" className="min-h-screen bg-white text-slate-900">
      <HeaderProfile
        report={report}
        reportId={reportId || report.reportId}
        shareToken={shareToken}
        isShareableView={isShareableView}
        isBrandMode={isBrandMode}
      />

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-slate-950">YouTube Public Insight</h2>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateTime(report.generatedAt || report.videoOverview?.publishedOn)}
          </div>
        </div>

        {/* TOP AREA: left content + right sidebar */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <VideoHero report={report} />
            <YouTubePublicOverview report={report} />
            <AiSummary report={report} />
            <EstimateGrid report={report} />
          </div>

          <aside className="space-y-5 self-start">
            <AudienceGauge data={report.audienceMatch} />
            <WatchTimeCard data={report.estimatedWatchTime as PlainObject} />
            <RevenueCard data={report.estimatedRevenue as PlainObject} />
            <AudienceSignalsCard data={report.audienceDemographic as PlainObject} />
          </aside>
        </div>

        {/* FULL WIDTH AREA: Creator Fit and everything below */}
        <div className="mt-6 space-y-5">
          <CreatorFit report={report} />

          <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
            <Card>
              <CardHeader title={report.contentPerformanceSummary?.title || "Video Performance Summary"} />

              <div className="px-5 pb-5">
                {report.contentPerformanceSummary?.rows?.length ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    {report.contentPerformanceSummary.rows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-4 border-b border-slate-100 px-3 py-3 text-xs last:border-b-0"
                      >
                        <span className="text-slate-600">{row.label}</span>
                        <b className="text-right text-slate-950">{row.value}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No performance summary available." />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title={report.performanceComparison?.title || "Video vs Creator Average"}
                subtitle={report.performanceComparison?.summary}
              />

              <div className="px-5 pb-5">
                {report.performanceComparison?.rows?.length ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <div className="grid min-w-[540px] grid-cols-4 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                      <span>Metric</span>
                      <span>This Video</span>
                      <span>Average</span>
                      <span>Result</span>
                    </div>

                    {report.performanceComparison.rows.map((row, index) => (
                      <div
                        key={index}
                        className="grid min-w-[540px] grid-cols-4 border-t border-slate-100 px-4 py-3 text-xs text-slate-600"
                      >
                        <span>{text(row.metric)}</span>
                        <b>{text(row.thisVideo)}</b>
                        <span>{text(row.creatorAverage)}</span>
                        <span>{text(row.result)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No creator-average comparison available." />
                )}
              </div>
            </Card>
          </div>

          <CommentBreakdown data={report.commentBreakdown} />
          <RecentVideos data={report.lastVideosComparison as PlainObject} />
          <ScoreBreakdown cards={report.scoreCards || []} />
        </div>

        <div className="py-16 text-center text-sm text-slate-400">
          You have reached the end of the page
        </div>
      </div>
    </main>
  );
}
