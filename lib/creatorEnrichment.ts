/**
 * Everything the influencer side does to a creator record without the team typing it:
 *
 * - findAndSaveCreatorEmail: looks for a business email in the pages the creator published
 *   (lib/creatorEmailFinder.ts) and fills in platform links found along the way.
 * - personalizeCreator: reads recent uploads and fills the influencer Email 1 variables
 *   (lib/outreachPersonalization.ts), rendered into the live template, ready to edit.
 * - ensureCreatorMediaKit: a current media kit with a public link, reusing a recent one.
 * - runCreatorEnrichmentPass: the worker's slice of the above — queued media kits first, then email
 *   lookups for creators that have never been checked.
 *
 * Pulls in the YouTube client, so it's only ever loaded lazily from the scheduler.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getChannelsDetailsBatch, getRecentChannelVideoIds, getVideosStats, youtubeGet } from "@/lib/youtube/api";
import { normalizeChannel, normalizeVideo } from "@/lib/youtube/normalize";
import { recordUnitsUsed } from "@/lib/youtube/discoveryEngine";
import { generateChannelMediaKit } from "@/lib/youtube/channelMediaKit";
import { findCreatorEmail } from "@/lib/creatorEmailFinder";
import { personalizeFromChannel, type PersonalizationResult, type PersonalizedVariables } from "@/lib/outreachPersonalization";
import { renderTemplate } from "@/lib/templates";
import { MEDIA_KIT_FRESH_DAYS } from "@/lib/creatorProfileSync";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Recent uploads read for highlights — enough to see what recurs, cheap either way (1 unit). */
const HIGHLIGHT_VIDEO_SAMPLE = 20;
const HIGHLIGHTS_FRESH_DAYS = 30;

// --- Email ---------------------------------------------------------------------------------------

export interface EmailLookupOutcome {
  ok: boolean;
  error?: string;
  email: string | null;
  emailSource: string | null;
  /** True when this run filled an email the creator didn't have. */
  found: boolean;
  checkedUrls: string[];
  platformsAdded: string[];
}

export async function findAndSaveCreatorEmail(creatorId: string, options: { deadlineMs?: number } = {}): Promise<EmailLookupOutcome> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) return { ok: false, error: "Creator not found", email: null, emailSource: null, found: false, checkedUrls: [], platformsAdded: [] };

  try {
    const result = await findCreatorEmail(
      { description: creator.description ?? "", channelTitle: creator.channelName ?? creator.name, channelUrl: creator.channelUrl },
      { deadlineMs: options.deadlineMs ?? 20_000 }
    );

    // Links the team saved (or corrected) by hand win over anything found.
    const existingLinks = (creator.platformLinks ?? {}) as Record<string, string>;
    const mergedLinks: Record<string, string> = { ...(result.platformLinks as Record<string, string>), ...existingLinks };
    const platformsAdded = Object.keys(mergedLinks).filter((key) => !existingLinks[key]);
    const fills = !creator.email && !!result.email;

    await prisma.creator.update({
      where: { id: creatorId },
      data: {
        emailCheckedAt: new Date(),
        platformLinks: mergedLinks,
        platformTags: Object.keys(mergedLinks),
        websiteLinks: [...new Set([...creator.websiteLinks, ...result.websiteLinks])].slice(0, 10),
        ...(fills ? { email: result.email, emailSource: result.source } : {}),
      },
    });

    return {
      ok: true,
      email: fills ? result.email : creator.email,
      emailSource: fills ? result.source : creator.emailSource,
      found: fills,
      checkedUrls: result.checkedUrls,
      platformsAdded,
    };
  } catch (err) {
    await prisma.creator.update({ where: { id: creatorId }, data: { emailCheckedAt: new Date() } }).catch(() => {});
    const message = err instanceof Error ? err.message : "Lookup failed";
    return { ok: false, error: message, email: creator.email, emailSource: creator.emailSource, found: false, checkedUrls: [], platformsAdded: [] };
  }
}

// --- Personalization -----------------------------------------------------------------------------

export interface CreatorRef {
  creatorId?: string | null;
  channelId?: string | null;
  channelUrl?: string | null;
}

async function resolveCreator(ref: CreatorRef) {
  if (ref.creatorId) {
    const creator = await prisma.creator.findUnique({ where: { id: ref.creatorId } });
    return { creator, channelId: creator?.channelId ?? null, unitsUsed: 0 };
  }
  if (ref.channelId) {
    const creator = await prisma.creator.findUnique({ where: { channelId: ref.channelId } });
    return { creator, channelId: ref.channelId, unitsUsed: 0 };
  }
  const url = ref.channelUrl?.trim();
  if (!url) return { creator: null, channelId: null, unitsUsed: 0 };
  const saved = await prisma.creator.findFirst({ where: { channelUrl: url } });
  if (saved) return { creator: saved, channelId: saved.channelId, unitsUsed: 0 };

  const idMatch = url.match(/\/channel\/(UC[\w-]{22})/);
  if (idMatch) {
    const creator = await prisma.creator.findUnique({ where: { channelId: idMatch[1] } });
    return { creator, channelId: idMatch[1], unitsUsed: 0 };
  }
  const handle = url.match(/\/@([\w.-]+)/)?.[1];
  if (!handle) return { creator: null, channelId: null, unitsUsed: 0 };
  const data = await youtubeGet<{ items?: { id?: string }[] }>("channels", { part: "id", forHandle: `@${handle}` });
  const channelId = data.items?.[0]?.id ?? null;
  const creator = channelId ? await prisma.creator.findUnique({ where: { channelId } }) : null;
  return { creator, channelId, unitsUsed: 1 };
}

export interface PersonalizedDraft {
  creatorId: string | null;
  channelId: string | null;
  name: string;
  channelUrl: string | null;
  thumbnailUrl: string | null;
  email: string | null;
  emailSource: string | null;
  variables: PersonalizedVariables;
  topics: PersonalizationResult["topics"];
  categorySource: PersonalizationResult["categorySource"];
  deliverableSource: PersonalizationResult["deliverableSource"];
  /** Highlights reused from the creator record (possibly edited by the team) instead of re-read. */
  highlightsReused: boolean;
  subject: string;
  body: string;
  templateSubject: string;
  templateBody: string;
}

export async function activeCreatorEmailTemplate() {
  return prisma.template.findFirst({ where: { outreachType: "CREATOR", recipientType: "DIRECT", step: 1, isActive: true } });
}

export async function personalizeCreator(
  ref: CreatorRef,
  campaign: { brandCategory?: string | null; deliverable?: string | null } = {},
  options: { refresh?: boolean; template?: { subject: string; body: string } | null } = {}
): Promise<PersonalizedDraft> {
  const { creator, channelId, unitsUsed: resolveUnits } = await resolveCreator(ref);
  if (!creator && !channelId) throw new Error("Couldn't find that YouTube channel — check the link.");

  let unitsUsed = resolveUnits;
  const cachedHighlights =
    !options.refresh && creator?.contentHighlights && creator.contentHighlightsAt && Date.now() - creator.contentHighlightsAt.getTime() < HIGHLIGHTS_FRESH_DAYS * DAY_MS
      ? creator.contentHighlights
      : null;

  // The uploads are only needed when highlights have to be (re)read, or when the brand category
  // must fall back to the channel's own strongest topic.
  const needsUploads = !cachedHighlights || !campaign.brandCategory?.trim();

  let channelTitle = creator?.channelName ?? creator?.name ?? "";
  let description = creator?.description ?? "";
  let channelUrl = creator?.channelUrl ?? ref.channelUrl ?? null;
  let thumbnailUrl = creator?.thumbnailUrl ?? null;
  let videoTitles: string[] = [];
  let videoTags: string[] = [];

  if (needsUploads && channelId) {
    const [raw] = await getChannelsDetailsBatch([channelId]);
    unitsUsed += 1;
    if (!raw) throw new Error("This channel no longer exists or is no longer public.");
    const channel = normalizeChannel(raw);
    channelTitle = channel.title || channelTitle;
    description = channel.description || description;
    channelUrl = channel.channelUrl || channelUrl;
    thumbnailUrl = channel.thumbnailUrl || thumbnailUrl;
    const ids = await getRecentChannelVideoIds(channel.uploadsPlaylistId, HIGHLIGHT_VIDEO_SAMPLE);
    unitsUsed += 1;
    if (ids.length > 0) {
      const videos = (await getVideosStats(ids)).map(normalizeVideo);
      unitsUsed += 1;
      videoTitles = videos.map((v) => v.title);
      videoTags = videos.flatMap((v) => v.tags);
    }
  }
  if (unitsUsed > 0) await recordUnitsUsed(unitsUsed).catch(() => {});

  const result = personalizeFromChannel({
    channelTitle: channelTitle || "there",
    description,
    videoTitles,
    videoTags,
    campaign,
    nicheHint: creator?.niche,
  });
  const variables: PersonalizedVariables = { ...result.variables, ...(cachedHighlights ? { Content_Highlights: cachedHighlights } : {}) };

  if (creator && !cachedHighlights && result.topics.length > 0) {
    await prisma.creator.update({
      where: { id: creator.id },
      data: { contentHighlights: variables.Content_Highlights, contentHighlightsAt: new Date() },
    });
  }

  const template = options.template === undefined ? await activeCreatorEmailTemplate() : options.template;
  const templateSubject = template?.subject ?? "";
  const templateBody = template?.body ?? "";
  const values = variables as unknown as Record<string, string>;

  return {
    creatorId: creator?.id ?? null,
    channelId,
    name: channelTitle || creator?.name || "",
    channelUrl,
    thumbnailUrl,
    email: creator?.email ?? null,
    emailSource: creator?.emailSource ?? null,
    variables,
    topics: result.topics,
    categorySource: result.categorySource,
    deliverableSource: result.deliverableSource,
    highlightsReused: !!cachedHighlights,
    subject: renderTemplate(templateSubject, values),
    body: renderTemplate(templateBody, values),
    templateSubject,
    templateBody,
  };
}

// --- Media kit -----------------------------------------------------------------------------------

export interface CreatorMediaKit {
  mediaKitId: string;
  shareToken: string;
  generatedAt: Date;
  reused: boolean;
}

export async function ensureCreatorMediaKit(creatorId: string, options: { force?: boolean } = {}): Promise<CreatorMediaKit> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (!creator) throw new Error("Creator not found");
  if (!creator.channelId) throw new Error("This creator has no YouTube channel on file, so there's nothing to build a media kit from.");

  const freshAfter = new Date(Date.now() - MEDIA_KIT_FRESH_DAYS * DAY_MS);
  if (!options.force && creator.mediaKitId && creator.mediaKitShareToken && creator.mediaKitGeneratedAt && creator.mediaKitGeneratedAt > freshAfter) {
    await prisma.creator.update({ where: { id: creatorId }, data: { mediaKitRequestedAt: null } });
    return { mediaKitId: creator.mediaKitId, shareToken: creator.mediaKitShareToken, generatedAt: creator.mediaKitGeneratedAt, reused: true };
  }

  // A kit someone already made for this channel recently (e.g. from Discovery) is reused as-is.
  const recent = options.force
    ? null
    : await prisma.channelMediaKit.findFirst({ where: { channelId: creator.channelId, createdAt: { gte: freshAfter } }, orderBy: { createdAt: "desc" } });
  const mediaKitId = recent?.id ?? (await generateChannelMediaKit(creator.channelId, creator.niche ?? undefined)).mediaKitId;
  const generatedAt = recent?.createdAt ?? new Date();

  const share =
    (await prisma.channelMediaKitShare.findFirst({ where: { mediaKitId, revokedAt: null }, orderBy: { createdAt: "desc" } })) ??
    (await prisma.channelMediaKitShare.create({ data: { mediaKitId, token: randomBytes(32).toString("base64url") } }));

  await prisma.creator.update({
    where: { id: creatorId },
    data: { mediaKitId, mediaKitShareToken: share.token, mediaKitGeneratedAt: generatedAt, mediaKitRequestedAt: null },
  });

  const sequence = await prisma.outreachSequence.findFirst({
    where: { deletedAt: null, contact: { creatorId } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (sequence) {
    await prisma.activityLog.create({
      data: {
        sequenceId: sequence.id,
        eventType: "MEDIA_KIT_READY",
        description: `Media kit ready for ${creator.channelName ?? creator.name} — the public link is on the Creators roster.`,
      },
    });
  }

  return { mediaKitId, shareToken: share.token, generatedAt, reused: !!recent };
}

// --- Worker pass ---------------------------------------------------------------------------------

/**
 * Runs inside a worker tick after the sends: at most one queued media kit, then as many email
 * lookups as fit in the budget. Each lookup claims its creator first, so overlapping ticks never
 * read the same pages twice.
 */
export async function runCreatorEnrichmentPass(budgetMs: number) {
  const started = Date.now();
  const outcome = { mediaKits: 0, emailLookups: 0, emailsFound: 0 };

  const queued = await prisma.creator.findFirst({
    where: { mediaKitRequestedAt: { not: null } },
    orderBy: { mediaKitRequestedAt: "asc" },
    select: { id: true, mediaKitRequestedAt: true },
  });
  if (queued) {
    // Unqueued up front: a channel that can't be built from (deleted, private) must not retry forever.
    const claimed = await prisma.creator.updateMany({
      where: { id: queued.id, mediaKitRequestedAt: queued.mediaKitRequestedAt },
      data: { mediaKitRequestedAt: null },
    });
    if (claimed.count === 1) {
      try {
        await ensureCreatorMediaKit(queued.id);
        outcome.mediaKits++;
      } catch (err) {
        console.error(`[creator enrichment] media kit failed for creator ${queued.id}:`, err);
      }
    }
  }

  while (Date.now() - started < budgetMs - 6_000) {
    const next = await prisma.creator.findFirst({
      where: { channelId: { not: null }, email: null, emailCheckedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!next) break;
    const claimed = await prisma.creator.updateMany({ where: { id: next.id, emailCheckedAt: null }, data: { emailCheckedAt: new Date() } });
    if (claimed.count !== 1) continue;
    const remaining = budgetMs - (Date.now() - started);
    const result = await findAndSaveCreatorEmail(next.id, { deadlineMs: Math.max(4_000, Math.min(15_000, remaining - 2_000)) });
    outcome.emailLookups++;
    if (result.found) outcome.emailsFound++;
  }

  return outcome;
}
