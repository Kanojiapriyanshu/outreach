import { prisma } from "@/lib/prisma";
import { getChannelDetails, getRecentChannelVideoIds, getVideosStats, getPublicCommentThreads } from "./api";
import { normalizeChannel, normalizeVideo, calculateCreatorAverage, type NormalizedVideo } from "./normalize";
import { extractChannelContact, type ExtractedPlatformLinks } from "./channelExtractor";
import { generateChannelMediaKitNarrative, type ChannelMediaKitContext, type ChannelMediaKitNarrative } from "./channelMediaKitAI";
import { clamp } from "./numbers";
import { estimateAudienceDemographics } from "./audienceEstimation";

/**
 * A whole-channel performance report — "should we work with this creator at all," aimed at a
 * brand deciding whether to greenlight a deal, as distinct from Insight OS's per-video report
 * ("did this one upload do well"). Reuses every YouTube primitive Insight OS already built
 * (recent-uploads fetch, per-video normalization, the creator-average calculation, comment
 * fetching) — this file's own job is purely the channel-level aggregation and narrative on top.
 */

const SAMPLE_SIZE = 24;
const TOP_VIDEO_COUNT = 9;
const RECENT_VIDEO_COUNT = 10;

export interface VideoSummary {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  viewCount: number;
  engagementRate: number;
  publishedAt: string | null;
  durationDisplay: string;
}

/** {label, percent} — a percentage breakdown for one audience-demographic category. Matches the
 * exact shape the creator's own YouTube Studio shows them, so transcribing a screenshot into
 * CreatorDetailModal's editor is a direct copy, not a translation. */
export interface DemographicSlice {
  label: string;
  percent: number;
}

export interface SponsorshipEstimate {
  low: number;
  mid: number;
  high: number;
  /** What the estimate is actually for, since "per what" changes the number by 10x. */
  basis: string;
}

/** Why this creator surfaced as a fit — every field here is computed from the same sampled
 * uploads the rest of the kit uses, never from a brand-supplied opinion. */
export interface SelectionSignals {
  /** Share of sampled uploads that fall in the channel's own dominant category — a consistency
   * read, not a subjective "how relevant is this," so a channel that constantly drifts topic
   * scores lower even at high view counts. */
  nicheRelevancyPercent: number;
  uploadsLast90Days: number;
  brandSafetyLabel: string;
  brandSafetyScore: number;
  sponsorshipFrequencyPercent: number;
  recommendedDeliverables: string[];
}

/** Estimated from public titles/descriptions/tags and the channel's own self-reported country —
 * distinct from audienceCountries/audienceAgeRanges/audienceGenderSplit/audienceDevices, which are
 * only ever real numbers a human transcribed. Never presented as verified audience data. */
export interface AudienceEstimate {
  likelyPrimaryMarket: string;
  primaryMarketConfidence: number;
  contentLanguage: string;
  topics: string[];
  /** A single-slice stand-in for the Top Locations bar when no one has transcribed the creator's
   * real country breakdown yet — the same likelyPrimaryMarket/primaryMarketConfidence numbers
   * above, shaped as a DemographicSlice so the UI can render it in the same bar list. Only ever
   * shown in the kit's "estimated" area, never merged into or mislabeled as audienceCountries. */
  estimatedCountries: DemographicSlice[];
  /** Category-benchmark gender/age fallback for when nobody has transcribed the creator's real
   * numbers — see lib/youtube/audienceEstimation.ts. Only ever a stand-in: the moment
   * audienceGenderSplit/audienceAgeRanges have real entries, the UI uses those instead and these
   * are ignored. */
  estimatedGenderSplit: DemographicSlice[];
  estimatedAgeSplit: DemographicSlice[];
  dominantAgeBand: string | null;
  benchmarkCategoryLabel: string;
  benchmarkConfidence: "medium" | "low-medium" | "low";
  benchmarkBasis: string[];
}

export interface PerformanceSummary {
  medianViews: number;
  averageLikes: number;
  averageComments: number;
  longFormPercent: number;
  shortsPercent: number;
}

/** Six 0-100 sub-scores behind the headline Brand Fit Score — each formula-derived from public
 * data, never a subjective rating. */
export interface CreatorScorecard {
  engagement: number;
  consistency: number;
  authenticity: number;
  brandSafety: number;
  nicheRelevance: number;
  sponsorshipExperience: number;
}

export interface CampaignProjection {
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
  platformLinks: ExtractedPlatformLinks;
  sampleComments: string[];
  narrative: ChannelMediaKitNarrative;
  sponsorshipEstimate: SponsorshipEstimate;
  /** Only ever real numbers a human entered from the creator's own analytics — never inferred,
   * estimated, or guessed. Empty arrays when nothing has been shared yet, in which case the report
   * simply omits this section rather than showing a placeholder or a fabricated guess. */
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

/** How many days apart uploads land on average, turned into a plain-language cadence a brand can
 * read at a glance instead of a raw number. */
function describeUploadFrequency(publishDates: Date[]): string {
  if (publishDates.length < 2) return "Not enough recent uploads to establish a cadence";
  const sorted = [...publishDates].sort((a, b) => b.getTime() - a.getTime());
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push((sorted[i].getTime() - sorted[i + 1].getTime()) / (1000 * 60 * 60 * 24));
  }
  const avgGapDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  if (avgGapDays <= 1.5) return "Posts daily";
  if (avgGapDays <= 4) return "Posts several times a week";
  if (avgGapDays <= 9) return "Posts about once a week";
  if (avgGapDays <= 20) return "Posts every 2-3 weeks";
  if (avgGapDays <= 45) return "Posts about once a month";
  return "Posts infrequently";
}

/**
 * A deterministic 0-100 score so every media kit has a headline number even before (or without)
 * an AI call — weighted toward the two things that actually predict a campaign working: real
 * audience engagement, and how much of the subscriber base an upload actually reaches, over raw
 * subscriber count alone (a channel with fewer, more engaged subscribers can easily outscore a
 * much bigger one that few people actually watch).
 */
function computeBrandFitScore(params: {
  subscriberCount: number;
  engagementRate: number;
  viewToSubscriberRate: number;
  consistency: number; // 0-1, higher = more stable performance across sampled videos
  daysSinceLastUpload: number | null;
}): number {
  // log-scaled so 10K vs 100K subscribers matters more than 1M vs 1.1M does.
  const sizeScore = Math.min(25, Math.log10(Math.max(params.subscriberCount, 1)) * 5);
  const engagementScore = Math.min(30, params.engagementRate * 5); // 6% engagement caps this out
  const reachScore = Math.min(25, params.viewToSubscriberRate * 0.5); // 50% view-to-sub caps this out
  const consistencyScore = params.consistency * 10;
  const recencyScore =
    params.daysSinceLastUpload === null ? 0 : params.daysSinceLastUpload <= 14 ? 10 : params.daysSinceLastUpload <= 45 ? 6 : params.daysSinceLastUpload <= 120 ? 2 : 0;

  return Math.round(Math.min(100, sizeScore + engagementScore + reachScore + consistencyScore + recencyScore));
}

/** Coefficient of variation of per-video engagement, inverted to a 0-1 "consistency" score — a
 * creator whose engagement swings wildly video to video is a riskier bet than one who performs
 * about the same every time, even at a similar average. */
function computeConsistency(videos: NormalizedVideo[]): number {
  const rates = videos.map((v) => v.engagementRate).filter((r) => r > 0);
  if (rates.length < 2) return 0.5; // not enough signal either way
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  if (mean === 0) return 0;
  const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(1, 1 - cv / 2));
}

/**
 * A rough sponsorship-value range from average views, using the same CPM (cost per 1,000 views)
 * benchmarking every influencer-marketing rate card is built on. Explicitly an estimate with a
 * disclosed method, never presented as a quote — actual rates depend on niche, deliverable, and
 * negotiation, which this has no way to know.
 */
function estimateSponsorshipValue(averageViews: number): SponsorshipEstimate {
  const CPM_LOW = 8;
  const CPM_MID = 15;
  const CPM_HIGH = 25;
  return {
    low: Math.round((averageViews / 1000) * CPM_LOW),
    mid: Math.round((averageViews / 1000) * CPM_MID),
    high: Math.round((averageViews / 1000) * CPM_HIGH),
    basis: "one dedicated video, estimated from average views at standard industry CPM rates",
  };
}

function toDemographicSlices(raw: unknown): DemographicSlice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({ label: String((item as Record<string, unknown>)?.label ?? "").trim(), percent: Number((item as Record<string, unknown>)?.percent) }))
    .filter((s) => s.label && Number.isFinite(s.percent) && s.percent > 0);
}

const SPONSORSHIP_KEYWORDS = [
  "sponsored",
  "paid partnership",
  "paid promotion",
  "in partnership with",
  "in collaboration with",
  "brought to you by",
  "#ad",
  "promo code",
  "discount code",
  "use code",
  "affiliate link",
  "thanks to our sponsor",
];

const BRAND_RISK_KEYWORDS = ["scam", "fake", "clickbait", "banned", "controversy", "lawsuit", "fraud", "misleading", "offensive", "hate speech", "nsfw"];

const HINGLISH_WORDS = ["kaise", "kya", "hai", "acha", "bilkul", "bhai", "aapko", "paisa", "kitna", "kaha"];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Consistency-of-focus, not subjective relevance: what share of the sampled uploads actually
 * land in the channel's own dominant category. A channel that drifts topic constantly scores
 * lower here even if individual videos still do well. */
function computeNicheRelevancyPercent(categoryTally: Map<string, number>, topCategory: string | undefined, sampleSize: number): number {
  if (!topCategory || sampleSize === 0) return 0;
  return Math.round(((categoryTally.get(topCategory) ?? 0) / sampleSize) * 100);
}

function computeUploadsInLastDays(videos: NormalizedVideo[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return videos.filter((v) => v.publishedAt && v.publishedAt.getTime() >= cutoff).length;
}

/** hasPaidProductPlacement is a real signal YouTube exposes per-video; the keyword match on
 * title/description catches the sponsorships that don't set that flag (most don't). */
function computeSponsorshipFrequencyPercent(videos: NormalizedVideo[]): number {
  if (videos.length === 0) return 0;
  const flagged = videos.filter((v) => {
    if (v.hasPaidProductPlacement) return true;
    const text = `${v.title} ${v.description}`.toLowerCase();
    return SPONSORSHIP_KEYWORDS.some((k) => text.includes(k));
  }).length;
  return Math.round((flagged / videos.length) * 100);
}

/** A coarse public-metadata scan, not a substitute for an actual brand-safety review — flags
 * titles/descriptions carrying risk-adjacent language and scores down from there. */
function computeBrandSafety(videos: NormalizedVideo[]): { label: string; score: number } {
  const flagged = videos.filter((v) => {
    const text = `${v.title} ${v.description}`.toLowerCase();
    return BRAND_RISK_KEYWORDS.some((k) => text.includes(k));
  }).length;
  const score = Math.round(clamp(100 - flagged * 20, 30, 100));
  const label = score >= 85 ? "Strong" : score >= 65 ? "Moderate" : "Needs Review";
  return { label, score };
}

function computeContentFormatMix(videos: NormalizedVideo[]): { longFormPercent: number; shortsPercent: number } {
  if (videos.length === 0) return { longFormPercent: 0, shortsPercent: 0 };
  const shorts = videos.filter((v) => v.durationSeconds > 0 && v.durationSeconds <= 90).length;
  const shortsPercent = Math.round((shorts / videos.length) * 100);
  return { longFormPercent: 100 - shortsPercent, shortsPercent };
}

/** A rough script/keyword heuristic on public titles/descriptions — not language-detection-grade,
 * but enough to flag a primarily Hindi/Hinglish channel for a brand skimming the kit. */
function detectContentLanguage(videos: NormalizedVideo[]): string {
  const sample = videos
    .slice(0, 10)
    .map((v) => `${v.title} ${v.description}`)
    .join(" ");
  if (/[ऀ-ॿ]/.test(sample)) return "Hindi";
  const lower = sample.toLowerCase();
  const hinglishHits = HINGLISH_WORDS.filter((w) => lower.includes(w)).length;
  if (hinglishHits >= 2) return "Hindi/English (Hinglish)";
  return "English";
}

function computePrimaryMarket(channelCountry: string, language: string): { market: string; confidence: number } {
  if (channelCountry) return { market: channelCountry, confidence: 92 };
  if (language.startsWith("Hindi")) return { market: "IN", confidence: 55 };
  return { market: "Unknown", confidence: 0 };
}

/** Turns the primary-market guess into a one-bar stand-in for Top Locations, for when nobody has
 * transcribed this creator's real country breakdown yet. Deliberately a single slice, not an
 * invented multi-country split — the only real signal here is one country, so the estimate says
 * exactly that and nothing more. */
function computeEstimatedCountrySlices(market: string, confidence: number): DemographicSlice[] {
  if (!market || market === "Unknown" || confidence <= 0) return [];
  return [{ label: market, percent: confidence }];
}

function computeTopics(videos: NormalizedVideo[], topCategories: string[]): string[] {
  const tally = new Map<string, number>();
  for (const v of videos) {
    for (const rawTag of v.tags) {
      const tag = rawTag.trim();
      if (!tag || tag.length > 30) continue;
      tally.set(tag, (tally.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag);
  return [...new Set([...topCategories, ...topTags])].slice(0, 10);
}

function computeRecommendedDeliverables(shortsPercent: number): string[] {
  const deliverables = ["Dedicated Review", "Integrated Mention", "Community Post"];
  if (shortsPercent >= 30) deliverables.push("Shorts Integration");
  return deliverables;
}

function computeSizeTier(subscriberCount: number): string {
  if (subscriberCount < 10_000) return "Nano";
  if (subscriberCount < 100_000) return "Micro";
  if (subscriberCount < 1_000_000) return "Mid-tier";
  return "Macro";
}

function computeBudgetTier(sponsorshipMid: number): string {
  if (sponsorshipMid < 300) return "Low";
  if (sponsorshipMid < 800) return "Low-Medium";
  if (sponsorshipMid < 2000) return "Medium";
  if (sponsorshipMid < 6000) return "Medium-High";
  return "High";
}

/** Projected reach/value/engagements/clicks for one sponsored placement — every figure here
 * derives from this creator's own median views and measured engagement rate, never a flat
 * industry number. Reach is anchored to median rather than average so one viral outlier doesn't
 * inflate what a brand should actually expect from the next upload. */
function computeCampaignProjection(params: {
  medianViews: number;
  engagementRate: number;
  subscriberCount: number;
  channelAge: string;
  sponsorshipMid: number;
}): CampaignProjection {
  const reachLow = Math.round(params.medianViews * 0.75);
  const reachHigh = Math.round(params.medianViews * 1.25);
  return {
    budgetTier: computeBudgetTier(params.sponsorshipMid),
    sizeTier: computeSizeTier(params.subscriberCount),
    channelAgeLabel: params.channelAge ? `Active for ${params.channelAge}` : "Channel age unavailable",
    projectedReachLow: reachLow,
    projectedReachHigh: reachHigh,
    mediaValueLow: Math.round((reachLow / 1000) * 8),
    mediaValueHigh: Math.round((reachHigh / 1000) * 20),
    projectedEngagementsLow: Math.round((reachLow * params.engagementRate) / 100),
    projectedEngagementsHigh: Math.round((reachHigh * params.engagementRate) / 100),
    projectedClicksLow: Math.round(reachLow * 0.005),
    projectedClicksHigh: Math.round(reachHigh * 0.015),
  };
}

function computeScorecard(params: {
  engagementRate: number;
  consistency: number;
  nicheRelevancyPercent: number;
  brandSafetyScore: number;
  sponsorshipFrequencyPercent: number;
}): CreatorScorecard {
  return {
    engagement: Math.round(clamp(params.engagementRate * 15)),
    consistency: Math.round(clamp(params.consistency * 100)),
    authenticity: Math.round(clamp((clamp(params.consistency * 100) + params.brandSafetyScore) / 2)),
    brandSafety: Math.round(clamp(params.brandSafetyScore)),
    nicheRelevance: Math.round(clamp(params.nicheRelevancyPercent)),
    sponsorshipExperience: Math.round(clamp(params.sponsorshipFrequencyPercent * 4)),
  };
}

function toVideoSummary(v: NormalizedVideo): VideoSummary {
  return {
    videoId: v.videoId,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    videoUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
    viewCount: v.viewCount,
    engagementRate: v.engagementRate,
    publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    durationDisplay: v.durationDisplay,
  };
}

export async function generateChannelMediaKit(channelId: string, niche?: string): Promise<{ mediaKitId: string; data: ChannelMediaKitData }> {
  const raw = await getChannelDetails(channelId);
  const channel = normalizeChannel(raw);

  const videoIds = await getRecentChannelVideoIds(channel.uploadsPlaylistId, SAMPLE_SIZE);
  const rawVideos = videoIds.length > 0 ? await getVideosStats(videoIds) : [];
  const videos = rawVideos.map(normalizeVideo);

  // calculateCreatorAverage normalizes internally — it wants the raw API objects, not `videos`
  // above (which are already normalized flat shapes with no `.statistics`/`.snippet` for it to
  // read, so passing the normalized array here silently zeroed every metric).
  const average = calculateCreatorAverage(rawVideos, "");

  // A real channel with videos always has *some* average — if the sampled-upload calculation
  // still comes back empty (comments/stats temporarily unavailable, an unusual upload mix), fall
  // back to the channel's own lifetime total divided by its video count rather than showing "0"
  // for a metric that demonstrably isn't zero.
  const averageViews = average.averageViews > 0 || channel.videoCount === 0 ? average.averageViews : channel.totalViewCount / channel.videoCount;

  const viewToSubscriberRate = channel.subscriberCount > 0 ? (averageViews / channel.subscriberCount) * 100 : 0;

  const publishDates = videos.map((v) => v.publishedAt).filter((d): d is Date => d !== null);
  const uploadFrequencyLabel = describeUploadFrequency(publishDates);
  const daysSinceLastUpload = average.lastPublishedAt ? (Date.now() - average.lastPublishedAt.getTime()) / (1000 * 60 * 60 * 24) : null;
  const consistency = computeConsistency(videos);

  const brandFitScore = computeBrandFitScore({
    subscriberCount: channel.subscriberCount,
    engagementRate: average.averageEngagementRate,
    viewToSubscriberRate,
    consistency,
    daysSinceLastUpload,
  });

  const categoryTally = new Map<string, number>();
  for (const v of videos) {
    if (!v.categoryName) continue;
    categoryTally.set(v.categoryName, (categoryTally.get(v.categoryName) ?? 0) + 1);
  }
  const topCategories = [...categoryTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);

  const topVideos = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, TOP_VIDEO_COUNT).map(toVideoSummary);
  const recentUploads = [...videos]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, RECENT_VIDEO_COUNT)
    .map(toVideoSummary);

  const { platformLinks } = extractChannelContact(channel.description);

  // A qualitative flavor sample from whichever sampled video performed best — enough to show a
  // brand what the audience actually sounds like, without pulling comments from every video.
  let sampleComments: string[] = [];
  const bestVideo = [...videos].sort((a, b) => b.viewCount - a.viewCount)[0];
  if (bestVideo) {
    try {
      const threads = await getPublicCommentThreads(bestVideo.videoId, 20, { includeReplies: false });
      sampleComments = threads.comments
        .filter((c) => !c.isReply && c.text?.trim())
        .slice(0, 12)
        .map((c) => c.text.trim());
    } catch {
      // Comments can be disabled on a video — a media kit missing this one flavor section is
      // fine; failing the whole report over it would not be.
      sampleComments = [];
    }
  }

  // Real audience demographics, if the team has already transcribed them from this creator's own
  // YouTube Studio analytics onto their Creator record — never inferred here, see DemographicSlice.
  const creatorRecord = await prisma.creator.findUnique({ where: { channelId: channel.channelId } });
  const audienceCountries = toDemographicSlices(creatorRecord?.audienceCountries);
  const audienceAgeRanges = toDemographicSlices(creatorRecord?.audienceAgeRanges);
  const audienceGenderSplit = toDemographicSlices(creatorRecord?.audienceGenderSplit);
  const audienceDevices = toDemographicSlices(creatorRecord?.audienceDevices);

  const sponsorshipEstimate = estimateSponsorshipValue(averageViews);

  // Every field below is computed from the same sampled uploads/channel data above — formula
  // estimates, never a brand-supplied opinion or inferred audience data (see AudienceEstimate).
  const nicheRelevancyPercent = computeNicheRelevancyPercent(categoryTally, topCategories[0], videos.length);
  const uploadsLast90Days = computeUploadsInLastDays(videos, 90);
  const sponsorshipFrequencyPercent = computeSponsorshipFrequencyPercent(videos);
  const { label: brandSafetyLabel, score: brandSafetyScore } = computeBrandSafety(videos);
  const { longFormPercent, shortsPercent } = computeContentFormatMix(videos);
  const contentLanguage = detectContentLanguage(videos);
  const { market: likelyPrimaryMarket, confidence: primaryMarketConfidence } = computePrimaryMarket(channel.country, contentLanguage);
  const topics = computeTopics(videos, topCategories);
  const medianViews = median(videos.map((v) => v.viewCount));
  const averageLikes = videos.length > 0 ? Math.round(videos.reduce((sum, v) => sum + v.likeCount, 0) / videos.length) : 0;
  const averageComments = videos.length > 0 ? Math.round(videos.reduce((sum, v) => sum + v.commentCount, 0) / videos.length) : 0;

  // Category-benchmark gender/age fallback for whichever of those two nobody has transcribed the
  // creator's real numbers for yet — see audienceEstimation.ts for why this is the only honest
  // way to fill that gap (no public API exposes real viewer age/gender to anyone but the channel
  // owner). youtubeTopicCategory carries the channel's own declared category; `category` carries
  // the search niche that discovered this creator, ranked below the creator's own tags/titles so
  // an off-topic search term can't override what the channel is actually about.
  const demographicBenchmark = estimateAudienceDemographics({
    youtubeTopicCategory: topCategories[0],
    category: niche,
    tags: videos.flatMap((v) => v.tags),
    topics: topCategories,
    contentText: [channel.description, ...videos.slice(0, 15).map((v) => v.title)].filter(Boolean).join(" "),
    shortsPercentage: shortsPercent,
    primaryLanguage: contentLanguage,
  });

  const selectionSignals: SelectionSignals = {
    nicheRelevancyPercent,
    uploadsLast90Days,
    brandSafetyLabel,
    brandSafetyScore,
    sponsorshipFrequencyPercent,
    recommendedDeliverables: computeRecommendedDeliverables(shortsPercent),
  };

  const audienceEstimate: AudienceEstimate = {
    likelyPrimaryMarket,
    primaryMarketConfidence,
    contentLanguage,
    topics,
    estimatedCountries: computeEstimatedCountrySlices(likelyPrimaryMarket, primaryMarketConfidence),
    estimatedGenderSplit: demographicBenchmark.genderSplit,
    estimatedAgeSplit: demographicBenchmark.ageSplit,
    dominantAgeBand: demographicBenchmark.dominantAgeBand,
    benchmarkCategoryLabel: demographicBenchmark.categoryLabel,
    benchmarkConfidence: demographicBenchmark.confidence,
    benchmarkBasis: demographicBenchmark.basis,
  };

  const performanceSummary: PerformanceSummary = {
    medianViews,
    averageLikes,
    averageComments,
    longFormPercent,
    shortsPercent,
  };

  const scorecard = computeScorecard({
    engagementRate: average.averageEngagementRate,
    consistency,
    nicheRelevancyPercent,
    brandSafetyScore,
    sponsorshipFrequencyPercent,
  });

  const campaignProjection = computeCampaignProjection({
    medianViews,
    engagementRate: average.averageEngagementRate,
    subscriberCount: channel.subscriberCount,
    channelAge: channel.channelAge,
    sponsorshipMid: sponsorshipEstimate.mid,
  });

  const context: ChannelMediaKitContext = {
    channelTitle: channel.title,
    niche: niche || topCategories[0] || "",
    country: channel.country,
    subscriberCount: channel.subscriberCount,
    averageViews,
    engagementRate: average.averageEngagementRate,
    viewToSubscriberRate,
    uploadFrequencyLabel,
    brandFitScore,
    topCategories,
    topVideoTitles: topVideos.map((v) => v.title),
    sampleComments,
    platforms: Object.keys(platformLinks),
  };

  const narrative = await generateChannelMediaKitNarrative(context);

  const data: ChannelMediaKitData = {
    channelId: channel.channelId,
    channelTitle: channel.title,
    channelUrl: channel.channelUrl,
    thumbnailUrl: channel.thumbnailUrl,
    bannerUrl: channel.bannerUrl,
    country: channel.country,
    niche: context.niche,
    subscriberCount: channel.subscriberCount,
    totalViewCount: channel.totalViewCount,
    videoCount: channel.videoCount,
    averageViews: Math.round(averageViews),
    engagementRate: average.averageEngagementRate,
    viewToSubscriberRate,
    brandFitScore,
    uploadFrequencyLabel,
    topCategories,
    topVideos,
    recentUploads,
    platformLinks,
    sampleComments,
    narrative,
    sponsorshipEstimate,
    audienceCountries,
    audienceAgeRanges,
    audienceGenderSplit,
    audienceDevices,
    selectionSignals,
    audienceEstimate,
    performanceSummary,
    scorecard,
    campaignProjection,
  };

  const saved = await prisma.channelMediaKit.create({
    data: {
      channelId: channel.channelId,
      channelTitle: channel.title,
      channelUrl: channel.channelUrl,
      thumbnailUrl: channel.thumbnailUrl || null,
      country: channel.country || null,
      niche: context.niche || null,
      subscriberCount: channel.subscriberCount,
      totalViewCount: BigInt(Math.round(channel.totalViewCount)),
      videoCount: channel.videoCount,
      averageViews: Math.round(averageViews),
      engagementRate: average.averageEngagementRate,
      viewToSubscriberRate,
      brandFitScore,
      uploadFrequencyLabel,
      data: data as object,
    },
  });

  return { mediaKitId: saved.id, data };
}
