import { prisma } from "@/lib/prisma";
import { getChannelDetails, getRecentChannelVideoIds, getVideosStats, getPublicCommentThreads } from "./api";
import { normalizeChannel, normalizeVideo, calculateCreatorAverage, type NormalizedVideo } from "./normalize";
import { extractChannelContact, type ExtractedPlatformLinks } from "./channelExtractor";
import { generateChannelMediaKitNarrative, type ChannelMediaKitContext, type ChannelMediaKitNarrative } from "./channelMediaKitAI";

/**
 * A whole-channel performance report — "should we work with this creator at all," aimed at a
 * brand deciding whether to greenlight a deal, as distinct from Insight OS's per-video report
 * ("did this one upload do well"). Reuses every YouTube primitive Insight OS already built
 * (recent-uploads fetch, per-video normalization, the creator-average calculation, comment
 * fetching) — this file's own job is purely the channel-level aggregation and narrative on top.
 */

const SAMPLE_SIZE = 24;
const TOP_VIDEO_COUNT = 6;
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
  platformLinks: ExtractedPlatformLinks;
  sampleComments: string[];
  narrative: ChannelMediaKitNarrative;
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
  const viewToSubscriberRate = channel.subscriberCount > 0 ? (average.averageViews / channel.subscriberCount) * 100 : 0;

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
      const threads = await getPublicCommentThreads(bestVideo.videoId, 15, { includeReplies: false });
      sampleComments = threads.comments
        .filter((c) => !c.isReply && c.text?.trim())
        .slice(0, 8)
        .map((c) => c.text.trim());
    } catch {
      // Comments can be disabled on a video — a media kit missing this one flavor section is
      // fine; failing the whole report over it would not be.
      sampleComments = [];
    }
  }

  const context: ChannelMediaKitContext = {
    channelTitle: channel.title,
    niche: niche || topCategories[0] || "",
    country: channel.country,
    subscriberCount: channel.subscriberCount,
    averageViews: average.averageViews,
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
    country: channel.country,
    niche: context.niche,
    subscriberCount: channel.subscriberCount,
    totalViewCount: channel.totalViewCount,
    videoCount: channel.videoCount,
    averageViews: Math.round(average.averageViews),
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
      averageViews: Math.round(average.averageViews),
      engagementRate: average.averageEngagementRate,
      viewToSubscriberRate,
      brandFitScore,
      uploadFrequencyLabel,
      data: data as object,
    },
  });

  return { mediaKitId: saved.id, data };
}
