-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "audienceCountries" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Creator" ADD COLUMN "audienceAgeRanges" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Creator" ADD COLUMN "audienceGenderSplit" JSONB NOT NULL DEFAULT '[]';
