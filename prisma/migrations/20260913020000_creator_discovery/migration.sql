-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "channelId" TEXT;
ALTER TABLE "Creator" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "Creator" ADD COLUMN "country" TEXT;
ALTER TABLE "Creator" ADD COLUMN "subscriberCount" INTEGER;
ALTER TABLE "Creator" ADD COLUMN "averageViews" INTEGER;
ALTER TABLE "Creator" ADD COLUMN "engagementRate" DOUBLE PRECISION;
ALTER TABLE "Creator" ADD COLUMN "lastUploadAt" TIMESTAMP(3);
ALTER TABLE "Creator" ADD COLUMN "platformLinks" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Creator" ADD COLUMN "discoverySource" TEXT;
ALTER TABLE "Creator" ADD COLUMN "lastDiscoveredAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Creator_channelId_key" ON "Creator"("channelId");

-- CreateIndex
CREATE INDEX "Creator_subscriberCount_idx" ON "Creator"("subscriberCount");

-- CreateIndex
CREATE INDEX "Creator_lastDiscoveredAt_idx" ON "Creator"("lastDiscoveredAt");

-- CreateTable
CREATE TABLE "YoutubeApiUsage" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeApiUsage_date_key" ON "YoutubeApiUsage"("date");
