-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "audienceDevices" JSONB NOT NULL DEFAULT '[]';
