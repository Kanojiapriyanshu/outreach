-- CreateTable
CREATE TABLE "PitchSheet" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "brandEmail" TEXT,
    "intro" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchSheetItem" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "brandRate" DOUBLE PRECISION,
    "brandRateCurrency" TEXT,
    "deliverable" TEXT,
    "rateNote" TEXT,

    CONSTRAINT "PitchSheetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PitchSheet_token_key" ON "PitchSheet"("token");

-- CreateIndex
CREATE INDEX "PitchSheet_createdAt_idx" ON "PitchSheet"("createdAt");

-- CreateIndex
CREATE INDEX "PitchSheetItem_sheetId_idx" ON "PitchSheetItem"("sheetId");

-- CreateIndex
CREATE INDEX "PitchSheetItem_creatorId_idx" ON "PitchSheetItem"("creatorId");

-- AddForeignKey
ALTER TABLE "PitchSheetItem" ADD CONSTRAINT "PitchSheetItem_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PitchSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchSheetItem" ADD CONSTRAINT "PitchSheetItem_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

