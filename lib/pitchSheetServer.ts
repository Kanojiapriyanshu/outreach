import "server-only";
import { prisma } from "@/lib/prisma";
import { brandRateLine, isReadyToPitch, linkState } from "@/lib/pitchSheet";

const LIVE_REPLIED_SEQUENCE = {
  deletedAt: null,
  OR: [{ lastReplyAt: { not: null } }, { status: { in: ["REPLIED" as const, "UNSUBSCRIBED" as const] } }],
};

/** Whether each creator has replied / has a rate — the pitch-sheet eligibility inputs. */
export async function creatorEligibility(creatorIds: string[]) {
  const creators = await prisma.creator.findMany({
    where: { id: { in: creatorIds } },
    select: {
      id: true,
      name: true,
      channelName: true,
      quotedRateAt: true,
      contacts: { select: { sequences: { where: LIVE_REPLIED_SEQUENCE, select: { id: true }, take: 1 } } },
    },
  });
  return new Map(
    creators.map((c) => {
      const input = { replied: c.contacts.some((contact) => contact.sequences.length > 0), hasRate: c.quotedRateAt !== null };
      return [c.id, { name: c.channelName ?? c.name, ...input, ready: isReadyToPitch(input) }];
    })
  );
}

export function appBaseUrl(fallbackOrigin: string): string {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") || fallbackOrigin;
}

function handleFromUrl(url: string | null): string | null {
  const m = url ? /youtube\.com\/@([^/?#]+)/i.exec(url) : null;
  return m ? `@${decodeURIComponent(m[1])}` : null;
}

export class PitchSheetUnavailable extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Everything the brand's page and CSV show — and nothing else. The creator's own quote, email,
 * notes and reply text are deliberately never selected here.
 */
export async function loadPublicPitchSheet(token: string, base: string) {
  const sheet = await prisma.pitchSheet.findUnique({
    where: { token },
    select: {
      id: true,
      title: true,
      brandName: true,
      intro: true,
      expiresAt: true,
      revokedAt: true,
      updatedAt: true,
      items: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          brandRate: true,
          brandRateCurrency: true,
          deliverable: true,
          rateNote: true,
          creator: {
            select: {
              name: true,
              channelName: true,
              channelUrl: true,
              thumbnailUrl: true,
              country: true,
              niche: true,
              contentHighlights: true,
              subscriberCount: true,
              averageViews: true,
              engagementRate: true,
              mediaKitShareToken: true,
            },
          },
        },
      },
    },
  });
  if (!sheet) throw new PitchSheetUnavailable("This link isn't valid.", 404);

  const state = linkState(sheet);
  if (state === "expired") throw new PitchSheetUnavailable("This shortlist link has expired. Ask your Fidem Growth contact for a fresh one.", 410);
  if (state === "turned-off") throw new PitchSheetUnavailable("This shortlist link is no longer available.", 410);

  // A media kit link can be revoked on its own — only show the ones that still open.
  const tokens = sheet.items.map((i) => i.creator.mediaKitShareToken).filter((t): t is string => !!t);
  const liveKits = new Set(
    (await prisma.channelMediaKitShare.findMany({ where: { token: { in: tokens }, revokedAt: null }, select: { token: true } })).map((s) => s.token)
  );

  return {
    id: sheet.id,
    title: sheet.title,
    brandName: sheet.brandName,
    intro: sheet.intro,
    expiresAt: sheet.expiresAt?.toISOString() ?? null,
    updatedAt: sheet.updatedAt.toISOString(),
    creators: sheet.items.map((item) => {
      const c = item.creator;
      return {
        id: item.id,
        name: c.channelName ?? c.name,
        handle: handleFromUrl(c.channelUrl),
        channelUrl: c.channelUrl,
        thumbnailUrl: c.thumbnailUrl,
        country: c.country,
        focus: c.contentHighlights ?? c.niche,
        subscriberCount: c.subscriberCount,
        averageViews: c.averageViews,
        engagementRate: c.engagementRate,
        mediaKitUrl: c.mediaKitShareToken && liveKits.has(c.mediaKitShareToken) ? `${base}/media-kit/shared/${c.mediaKitShareToken}` : null,
        rate: brandRateLine(item),
      };
    }),
  };
}

export type PublicPitchSheet = Awaited<ReturnType<typeof loadPublicPitchSheet>>;
