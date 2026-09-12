-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "platformTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Creator" ADD COLUMN "description" TEXT;
