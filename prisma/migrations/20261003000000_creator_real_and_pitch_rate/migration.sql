-- The creator's real rate card and the price pitched to brands, kept apart.
ALTER TABLE "Creator"
ADD COLUMN     "rateCard" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "rateNote" TEXT,
ADD COLUMN     "pitchRateAmount" DOUBLE PRECISION,
ADD COLUMN     "pitchRateCurrency" TEXT,
ADD COLUMN     "pitchRateDeliverable" TEXT;
