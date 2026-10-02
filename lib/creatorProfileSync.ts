/**
 * Keeps the Creator roster row in step with what happens in that creator's outreach threads —
 * their latest quoted rate, and a media kit queued the moment they reply. Database-only (no YouTube
 * client), so the scheduler can call it without pulling the API stack into the worker.
 */
import { prisma } from "@/lib/prisma";
import { parseStoredRates, primaryRate } from "@/lib/creatorReplyAnalysis";

/** A media kit younger than this is still current enough to hand a brand. */
export const MEDIA_KIT_FRESH_DAYS = 30;

async function creatorIdForSequence(sequenceId: string): Promise<string | null> {
  const sequence = await prisma.outreachSequence.findUnique({
    where: { id: sequenceId },
    select: { contact: { select: { creatorId: true } } },
  });
  return sequence?.contact.creatorId ?? null;
}

/**
 * Copies the sequence's headline rate onto its creator, so the roster shows one price per person.
 *
 * The creator's real rate is the team's to change: a rate read from an email only fills an empty
 * slot, and a rate card entered on the creator (from the rate sheet or by hand) is never touched
 * from a thread at all. `byHand` is the team editing the thread's rate themselves.
 */
export async function syncCreatorRateFromSequence(sequenceId: string, { byHand = false }: { byHand?: boolean } = {}): Promise<void> {
  const sequence = await prisma.outreachSequence.findUnique({
    where: { id: sequenceId },
    select: {
      quotedRates: true,
      quotedRateAt: true,
      contact: { select: { creatorId: true, creator: { select: { quotedRateAt: true, rateCard: true, rateNote: true } } } },
    },
  });
  const creatorId = sequence?.contact.creatorId;
  const creator = sequence?.contact.creator;
  if (!sequence || !creatorId || !creator) return;
  if (parseStoredRates(creator.rateCard).length > 0 || creator.rateNote) return;
  if (!byHand && creator.quotedRateAt) return;
  const primary = primaryRate(parseStoredRates(sequence.quotedRates));
  await prisma.creator.update({
    where: { id: creatorId },
    data: primary
      ? {
          quotedRateAmount: primary.amount,
          quotedRateCurrency: primary.currency,
          quotedRateDeliverable: primary.deliverable,
          quotedRateAt: sequence.quotedRateAt ?? new Date(),
        }
      : { quotedRateAmount: null, quotedRateCurrency: null, quotedRateDeliverable: null, quotedRateAt: null },
  });
}

/**
 * Queues a media kit for the creator behind this thread (the worker makes it), unless a fresh one
 * already exists or one is already queued. Creators with no YouTube channel on file are skipped.
 */
export async function requestCreatorMediaKit(sequenceId: string): Promise<void> {
  const creatorId = await creatorIdForSequence(sequenceId);
  if (!creatorId) return;
  const freshAfter = new Date(Date.now() - MEDIA_KIT_FRESH_DAYS * 24 * 60 * 60 * 1000);
  await prisma.creator.updateMany({
    where: {
      id: creatorId,
      channelId: { not: null },
      mediaKitRequestedAt: null,
      OR: [{ mediaKitShareToken: null }, { mediaKitGeneratedAt: null }, { mediaKitGeneratedAt: { lt: freshAfter } }],
    },
    data: { mediaKitRequestedAt: new Date() },
  });
}
