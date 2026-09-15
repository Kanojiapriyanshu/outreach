-- AlterEnum
ALTER TYPE "ActivityEventType" ADD VALUE 'MEDIA_KIT_READY';

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "contentHighlights" TEXT,
ADD COLUMN     "contentHighlightsAt" TIMESTAMP(3),
ADD COLUMN     "emailCheckedAt" TIMESTAMP(3),
ADD COLUMN     "emailSource" TEXT,
ADD COLUMN     "mediaKitGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "mediaKitId" TEXT,
ADD COLUMN     "mediaKitRequestedAt" TIMESTAMP(3),
ADD COLUMN     "mediaKitShareToken" TEXT,
ADD COLUMN     "quotedRateAmount" DOUBLE PRECISION,
ADD COLUMN     "quotedRateAt" TIMESTAMP(3),
ADD COLUMN     "quotedRateCurrency" TEXT,
ADD COLUMN     "quotedRateDeliverable" TEXT,
ADD COLUMN     "websiteLinks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Creator_mediaKitRequestedAt_idx" ON "Creator"("mediaKitRequestedAt");

-- CreateIndex
CREATE INDEX "Creator_emailCheckedAt_idx" ON "Creator"("emailCheckedAt");

-- Backfill: label where emails saved before this change came from, so every email on the roster
-- shows a source. Discovery only ever read them out of the channel description; anything that
-- isn't in the description was typed in by hand.
UPDATE "Creator"
SET "emailSource" = CASE
  WHEN "description" IS NOT NULL AND position(lower("email") in lower("description")) > 0 THEN 'Channel description'
  ELSE 'Entered by hand'
END
WHERE "email" IS NOT NULL;
