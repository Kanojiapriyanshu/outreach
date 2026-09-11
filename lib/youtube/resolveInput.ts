import "server-only";
import { youtubeGet, getVideoDetails } from "./api";
import { extractYouTubeVideoId, buildYouTubeWatchUrl } from "./url";

/**
 * Works out which video to analyse from whatever was pasted in.
 *
 * A video URL is the straightforward case. But the input box invites a "creator link", and people
 * paste channel URLs and @handles at least as often — so those resolve to that channel's most
 * recent upload rather than failing with "invalid video URL", which is a confusing thing to be
 * told when you pasted a perfectly valid YouTube link.
 */

export interface ResolvedInput {
  videoUrl: string;
  originalInput: string;
  /** True when a channel/handle was given and we picked its latest video. Surfaced to the user so
   * it's clear which video the report is actually about. */
  resolvedFromProfile: boolean;
  channelTitle?: string;
}

function extractChannelHandle(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("@")) return trimmed.slice(1);

  try {
    const url = new URL(trimmed);
    if (!/(^|\.)youtube\.com$/.test(url.hostname.replace(/^www\./, ""))) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return parts[0].slice(1);
    if (parts[0] === "c" && parts[1]) return parts[1];
    if (parts[0] === "channel" && parts[1]) return parts[1];
    if (parts[0] === "user" && parts[1]) return parts[1];
  } catch {
    return null;
  }
  return null;
}

async function latestVideoForChannel(handleOrId: string): Promise<{ videoId: string; channelTitle: string } | null> {
  // A raw channel id can be looked up directly; anything else has to go through search, which is
  // the only way to turn a handle or vanity name into a channel.
  let channelId = /^UC[\w-]{22}$/.test(handleOrId) ? handleOrId : "";
  let channelTitle = "";

  if (!channelId) {
    const byHandle = await youtubeGet("channels", { part: "id,snippet", forHandle: handleOrId }).catch(() => null);
    const hit = (byHandle?.items ?? [])[0] as any;
    if (hit) {
      channelId = hit.id;
      channelTitle = hit.snippet?.title ?? "";
    }
  }

  if (!channelId) {
    const search = await youtubeGet("search", {
      part: "snippet",
      q: handleOrId,
      type: "channel",
      maxResults: 1,
    }).catch(() => null);
    const hit = (search?.items ?? [])[0] as any;
    if (!hit) return null;
    channelId = hit.snippet?.channelId ?? hit.id?.channelId ?? "";
    channelTitle = hit.snippet?.title ?? "";
  }
  if (!channelId) return null;

  const channel = await youtubeGet("channels", { part: "snippet,contentDetails", id: channelId });
  const item = (channel.items ?? [])[0] as any;
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  channelTitle = channelTitle || item?.snippet?.title || "";
  if (!uploads) return null;

  const playlist = await youtubeGet("playlistItems", {
    part: "contentDetails",
    playlistId: uploads,
    maxResults: 1,
  });
  const videoId = ((playlist.items ?? [])[0] as any)?.contentDetails?.videoId;
  return videoId ? { videoId, channelTitle } : null;
}

export async function resolveInsightInput(rawInput: string): Promise<ResolvedInput> {
  const input = String(rawInput ?? "").trim();
  if (!input) {
    const err: any = new Error("Paste a YouTube video or channel link to analyse.");
    err.statusCode = 400;
    throw err;
  }

  const videoId = extractYouTubeVideoId(input);
  if (videoId) {
    return { videoUrl: buildYouTubeWatchUrl(videoId), originalInput: input, resolvedFromProfile: false };
  }

  const handle = extractChannelHandle(input);
  if (handle) {
    const latest = await latestVideoForChannel(handle);
    if (latest) {
      // Confirm the video is actually retrievable before handing it to the report engine, so a
      // private or removed latest upload surfaces here rather than midway through analysis.
      await getVideoDetails(latest.videoId);
      return {
        videoUrl: buildYouTubeWatchUrl(latest.videoId),
        originalInput: input,
        resolvedFromProfile: true,
        channelTitle: latest.channelTitle,
      };
    }
  }

  const err: any = new Error(
    "Couldn't read that as a YouTube video or channel. Paste a video link, a channel link, or an @handle."
  );
  err.statusCode = 400;
  throw err;
}
