import "server-only";
import { toNumber } from "./numbers";
import { getBestThumbnail } from "./fields";

/**
 * The YouTube Data API client.
 *
 * Ported from the Fidem CRM's `server/services/youtubeApi.service.js`, with two deliberate
 * changes for this app's runtime:
 *
 *  - `fetch` instead of axios, since this runs inside Next route handlers where fetch is native
 *    and adding an HTTP client for one caller isn't worth the weight.
 *  - The key cursor starts at a random offset (see below), because serverless invocations don't
 *    share module state the way a long-lived Express process does.
 */

const YOUTUBE_BASE_URL = "https://www.googleapis.com/youtube/v3";

const PUBLIC_VIDEO_PARTS = [
  "snippet",
  "contentDetails",
  "statistics",
  "status",
  "player",
  "topicDetails",
  "recordingDetails",
  "liveStreamingDetails",
  "paidProductPlacementDetails",
].join(",");

const PUBLIC_CHANNEL_PARTS = [
  "snippet",
  "contentDetails",
  "statistics",
  "status",
  "brandingSettings",
  "topicDetails",
  "localizations",
].join(",");

function apiKeys(): string[] {
  return String(process.env.YOUTUBE_API_KEY ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Where in the key list to start.
 *
 * The original kept a module-level cursor that advanced across every request in one long-running
 * process, spreading load evenly over the keys. Serverless instances are short-lived and don't
 * share memory, so a fixed start would hammer key #1 from every cold instance and exhaust its
 * daily quota while the rest sat idle. Starting at a random offset distributes load across
 * instances; within a single instance the cursor still advances on quota errors exactly as before.
 */
let keyCursor = -1;

export class YouTubeApiError extends Error {
  readonly statusCode: number;
  readonly reason: string;
  constructor(message: string, statusCode: number, reason = "") {
    super(message);
    this.name = "YouTubeApiError";
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

/** Quota and bad-key failures are the ones worth retrying on a different key; everything else is
 * a real error that another key would fail at identically. */
function isQuotaOrKeyError(status: number, reason: string): boolean {
  if (![400, 403, 429].includes(status)) return false;
  return /quotaexceeded|dailylimitexceeded|ratelimitexceeded|userratelimitexceeded|keyinvalid|forbidden/.test(
    reason.toLowerCase()
  );
}

type YouTubeListResponse = {
  items?: Record<string, unknown>[];
  nextPageToken?: string;
};

export async function youtubeGet<T = YouTubeListResponse>(
  endpoint: string,
  params: Record<string, string | number | undefined>
): Promise<T> {
  const keys = apiKeys();
  if (keys.length === 0) {
    throw new YouTubeApiError(
      "YOUTUBE_API_KEY is not set. Add one or more comma-separated YouTube Data API keys.",
      500
    );
  }

  if (keyCursor < 0) keyCursor = Math.floor(Math.random() * keys.length);

  let lastError: YouTubeApiError | null = null;

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const keyIndex = (keyCursor + attempt) % keys.length;

    const search = new URLSearchParams({ key: keys[keyIndex] });
    for (const [name, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      search.set(name, String(value));
    }

    let res: Response;
    try {
      res = await fetch(`${YOUTUBE_BASE_URL}/${endpoint}?${search.toString()}`, {
        signal: AbortSignal.timeout(Number(process.env.YOUTUBE_TIMEOUT_MS ?? 20000)),
        cache: "no-store",
      });
    } catch (err) {
      lastError = new YouTubeApiError(
        err instanceof Error ? err.message : "YouTube API request failed.",
        504
      );
      continue;
    }

    if (res.ok) {
      keyCursor = keyIndex;
      return (await res.json()) as T;
    }

    const payload = await res.json().catch(() => null);
    const apiError = (payload as { error?: { message?: string; errors?: { reason?: string }[] } } | null)?.error;
    const reason = apiError?.errors?.[0]?.reason ?? "";
    lastError = new YouTubeApiError(
      apiError?.message ?? "YouTube API request failed.",
      res.status,
      reason
    );

    if (attempt < keys.length - 1 && isQuotaOrKeyError(res.status, reason)) continue;
    throw lastError;
  }

  throw lastError ?? new YouTubeApiError("YouTube API request failed.", 500);
}

export async function getVideoDetails(videoId: string): Promise<Record<string, any>> {
  const data = await youtubeGet("videos", { part: PUBLIC_VIDEO_PARTS, id: videoId });
  const video = data.items?.[0];
  if (!video) throw new YouTubeApiError("Video not found or unavailable.", 404);
  return video;
}

export async function getChannelDetails(channelId: string): Promise<Record<string, any>> {
  const data = await youtubeGet("channels", { part: PUBLIC_CHANNEL_PARTS, id: channelId });
  const channel = data.items?.[0];
  if (!channel) throw new YouTubeApiError("Channel not found or unavailable.", 404);
  return channel;
}

/** Same batching trick as getVideosStats — one call for up to 50 channels instead of one call
 * each, since channels.list accepts a comma-joined id list just like videos.list does. This is
 * what makes Discovery's search results affordable: a page of 50 search hits costs 1 extra unit
 * to fully resolve, not 50. */
export async function getChannelsDetailsBatch(channelIds: string[]): Promise<Record<string, any>[]> {
  const ids = [...new Set(channelIds.filter(Boolean))].slice(0, 50);
  if (ids.length === 0) return [];

  const data = await youtubeGet("channels", { part: PUBLIC_CHANNEL_PARTS, id: ids.join(",") });
  return (data.items ?? []) as Record<string, any>[];
}

export interface SearchChannelsOptions {
  /** 1-50, YouTube's own per-page cap. */
  maxResults?: number;
  /** ISO 3166-1 alpha-2 (e.g. "IN", "US"). Biases relevance toward that region — it does NOT
   * hard-filter a channel's actual location, which only channels.list's snippet.country reports. */
  regionCode?: string;
  relevanceLanguage?: string;
  order?: "relevance" | "viewCount" | "date";
  pageToken?: string;
}

export interface SearchChannelHit {
  channelId: string;
  title: string;
  thumbnailUrl: string;
}

/**
 * search.list, type=channel — the one endpoint that finds channels by keyword rather than
 * requiring an already-known ID. Costs 100 quota units per call regardless of maxResults, so
 * callers should fetch one full page (up to 50) and filter it down rather than requesting a
 * small page and re-searching to top it up — see lib/youtube/discoveryEngine.ts.
 *
 * Returns bare id/title/thumbnail only; a search hit's own snippet.description is truncated and
 * unsuitable for email/platform-link extraction — resolve full channel details separately via
 * getChannelsDetailsBatch for anything beyond "does this channel exist and what's it called."
 */
export async function searchChannels(
  query: string,
  opts: SearchChannelsOptions = {}
): Promise<{ items: SearchChannelHit[]; nextPageToken?: string }> {
  const data = await youtubeGet("search", {
    part: "snippet",
    q: query,
    type: "channel",
    maxResults: Math.min(Math.max(opts.maxResults ?? 25, 1), 50),
    regionCode: opts.regionCode,
    relevanceLanguage: opts.relevanceLanguage,
    order: opts.order,
    pageToken: opts.pageToken,
  });

  const items = ((data.items ?? []) as any[])
    // A channel-type search hit carries its id at snippet.channelId, with id.channelId as a
    // fallback — the same shape lib/youtube/resolveInput.ts already relies on.
    .map((hit) => ({
      channelId: hit.snippet?.channelId ?? hit.id?.channelId ?? "",
      title: hit.snippet?.title ?? "",
      thumbnailUrl: getBestThumbnail(hit.snippet?.thumbnails),
    }))
    .filter((hit) => hit.channelId);

  return { items, nextPageToken: data.nextPageToken };
}

export interface PublicComment {
  commentThreadId?: string;
  commentId: string;
  parentId?: string;
  authorDisplayName: string;
  authorChannelId: string;
  authorProfileImageUrl: string;
  text: string;
  likeCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
  replyCount?: number;
  isReply: boolean;
  /** The inline replies YouTube ships with a thread — a sample, not the full set. */
  repliesPreview?: PublicComment[];
  previewOnly?: boolean;
}

export interface CommentThreadsResult {
  comments: PublicComment[];
  replies: PublicComment[];
  /** Comments turned off on the video — a normal state, not a failure. */
  disabled: boolean;
  error: string | null;
  /** True when replies were fetched in full, rather than only the handful YouTube returns inline
   * with each thread. The analysis reports this so a partial sample isn't read as the whole. */
  repliesFullyFetched: boolean;
  commentCountFetched: number;
  replyCountFetched: number;
}

export interface CommentThreadOptions {
  includeReplies?: boolean;
  maxRepliesPerThread?: number;
  order?: "relevance" | "time";
}

function mapReply(reply: any, parentId: string, previewOnly: boolean): PublicComment {
  return {
    commentId: reply.id,
    parentId,
    authorDisplayName: reply.snippet?.authorDisplayName ?? "",
    authorChannelId: reply.snippet?.authorChannelId?.value ?? "",
    authorProfileImageUrl: reply.snippet?.authorProfileImageUrl ?? "",
    text: reply.snippet?.textOriginal ?? reply.snippet?.textDisplay ?? "",
    likeCount: toNumber(reply.snippet?.likeCount),
    publishedAt: reply.snippet?.publishedAt ?? null,
    updatedAt: reply.snippet?.updatedAt ?? null,
    isReply: true,
    previewOnly,
  };
}

/** Pages through every reply on one comment thread. Only called when the caller explicitly asks
 * for full replies — each thread costs its own API call, so it's opt-in. */
export async function getCommentReplies(parentId: string, maxReplies = 100): Promise<PublicComment[]> {
  const safeMax = Math.max(0, Math.min(toNumber(maxReplies, 100), 500));
  if (!parentId || !safeMax) return [];

  const replies: PublicComment[] = [];
  let pageToken: string | undefined;

  while (replies.length < safeMax) {
    const data = await youtubeGet("comments", {
      part: "snippet",
      parentId,
      maxResults: Math.min(100, safeMax - replies.length),
      textFormat: "plainText",
      pageToken,
    });

    replies.push(...((data.items ?? []) as any[]).map((r) => mapReply(r, parentId, false)));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return replies;
}

export async function getPublicCommentThreads(
  videoId: string,
  maxComments = 300,
  options: CommentThreadOptions = {}
): Promise<CommentThreadsResult> {
  const maxAllowed = Math.max(0, Math.min(toNumber(maxComments, 300), 500));
  const empty: CommentThreadsResult = {
    comments: [],
    replies: [],
    disabled: false,
    error: null,
    repliesFullyFetched: false,
    commentCountFetched: 0,
    replyCountFetched: 0,
  };
  if (!maxAllowed) return empty;

  const includeReplies = Boolean(options.includeReplies);
  const maxRepliesPerThread = Math.max(0, Math.min(toNumber(options.maxRepliesPerThread, 25), 100));
  const order = options.order === "time" ? "time" : "relevance";

  const comments: PublicComment[] = [];
  const replies: PublicComment[] = [];
  let pageToken: string | undefined;

  try {
    while (comments.length < maxAllowed) {
      const remaining = maxAllowed - comments.length;
      const data = await youtubeGet("commentThreads", {
        part: "snippet,replies",
        videoId,
        maxResults: Math.min(100, remaining),
        order,
        textFormat: "plainText",
        pageToken,
      });

      for (const item of (data.items ?? []) as any[]) {
        const top = item.snippet?.topLevelComment;
        const snippet = top?.snippet ?? {};
        const previewReplies = ((item.replies?.comments ?? []) as any[]).map((r) =>
          mapReply(r, top?.id ?? "", true)
        );

        const row: PublicComment = {
          commentThreadId: item.id,
          commentId: top?.id ?? "",
          authorDisplayName: snippet.authorDisplayName ?? "",
          authorChannelId: snippet.authorChannelId?.value ?? "",
          authorProfileImageUrl: snippet.authorProfileImageUrl ?? "",
          text: snippet.textOriginal ?? snippet.textDisplay ?? "",
          likeCount: toNumber(snippet.likeCount),
          publishedAt: snippet.publishedAt ?? null,
          updatedAt: snippet.updatedAt ?? null,
          replyCount: toNumber(item.snippet?.totalReplyCount),
          repliesPreview: previewReplies,
          isReply: false,
        };
        comments.push(row);

        if (includeReplies && row.commentId && (row.replyCount ?? 0) > 0) {
          replies.push(...(await getCommentReplies(row.commentId, maxRepliesPerThread)));
        } else if (!includeReplies) {
          replies.push(...previewReplies);
        }
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return {
      comments,
      replies,
      disabled: false,
      error: null,
      repliesFullyFetched: includeReplies,
      commentCountFetched: comments.length,
      replyCountFetched: replies.length,
    };
  } catch (err) {
    // Comments being switched off is expected on plenty of videos — the report still has value
    // without them, so this returns a flag rather than failing the whole analysis.
    if (err instanceof YouTubeApiError && err.statusCode === 403 && err.reason === "commentsDisabled") {
      return { ...empty, disabled: true, error: err.message };
    }
    throw err;
  }
}

export async function getRecentChannelVideoIds(uploadPlaylistId: string, limit = 12): Promise<string[]> {
  if (!uploadPlaylistId) return [];

  const safeLimit = Math.min(Math.max(toNumber(limit, 12), 1), 50);
  const data = await youtubeGet("playlistItems", {
    part: "snippet,contentDetails,status",
    playlistId: uploadPlaylistId,
    maxResults: safeLimit,
  });

  return ((data.items ?? []) as any[])
    .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId)
    .filter(Boolean);
}

export async function getVideosStats(videoIds: string[]): Promise<Record<string, any>[]> {
  const ids = [...new Set(videoIds.filter(Boolean))].slice(0, 50);
  if (ids.length === 0) return [];

  const data = await youtubeGet("videos", {
    part: "snippet,contentDetails,statistics,status,topicDetails",
    id: ids.join(","),
  });
  return (data.items ?? []) as Record<string, any>[];
}

