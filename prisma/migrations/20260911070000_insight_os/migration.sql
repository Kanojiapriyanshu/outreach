-- CreateTable
CREATE TABLE "InsightReport" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "videoTitle" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verdict" TEXT,
    "publishedAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightReportShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "InsightReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightReport_createdAt_idx" ON "InsightReport"("createdAt");

-- CreateIndex
CREATE INDEX "InsightReport_videoId_idx" ON "InsightReport"("videoId");

-- CreateIndex
CREATE INDEX "InsightReport_channelId_idx" ON "InsightReport"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "InsightReportShare_token_key" ON "InsightReportShare"("token");

-- CreateIndex
CREATE INDEX "InsightReportShare_reportId_idx" ON "InsightReportShare"("reportId");

-- AddForeignKey
ALTER TABLE "InsightReportShare" ADD CONSTRAINT "InsightReportShare_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InsightReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
