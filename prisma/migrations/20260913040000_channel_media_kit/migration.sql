-- CreateTable
CREATE TABLE "ChannelMediaKit" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "channelUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "country" TEXT,
    "niche" TEXT,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "totalViewCount" BIGINT NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "averageViews" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewToSubscriberRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brandFitScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uploadFrequencyLabel" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelMediaKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMediaKitShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "mediaKitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChannelMediaKitShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelMediaKit_createdAt_idx" ON "ChannelMediaKit"("createdAt");

-- CreateIndex
CREATE INDEX "ChannelMediaKit_channelId_idx" ON "ChannelMediaKit"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMediaKitShare_token_key" ON "ChannelMediaKitShare"("token");

-- CreateIndex
CREATE INDEX "ChannelMediaKitShare_mediaKitId_idx" ON "ChannelMediaKitShare"("mediaKitId");

-- AddForeignKey
ALTER TABLE "ChannelMediaKitShare" ADD CONSTRAINT "ChannelMediaKitShare_mediaKitId_fkey" FOREIGN KEY ("mediaKitId") REFERENCES "ChannelMediaKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
