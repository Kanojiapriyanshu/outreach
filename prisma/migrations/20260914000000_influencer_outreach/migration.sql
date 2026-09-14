-- AlterEnum
ALTER TYPE "PipelineStage" ADD VALUE 'INTERESTED';
ALTER TYPE "PipelineStage" ADD VALUE 'RATE_RECEIVED';

-- AlterEnum
ALTER TYPE "ScheduledActionKind" ADD VALUE 'CREATOR_NUDGE';

-- AlterEnum
ALTER TYPE "ActivityEventType" ADD VALUE 'RATE_DETECTED';
ALTER TYPE "ActivityEventType" ADD VALUE 'REPLY_HANDLED';

-- AlterTable
ALTER TABLE "OutreachSequence" ADD COLUMN     "awaitingResponseSince" TIMESTAMP(3),
ADD COLUMN     "lastReplyAt" TIMESTAMP(3),
ADD COLUMN     "lastReplyText" TEXT,
ADD COLUMN     "quotedRateAmount" DOUBLE PRECISION,
ADD COLUMN     "quotedRateAt" TIMESTAMP(3),
ADD COLUMN     "quotedRateCurrency" TEXT,
ADD COLUMN     "quotedRates" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "rateNote" TEXT,
ADD COLUMN     "repliedAfterStep" INTEGER,
ADD COLUMN     "replyIntent" TEXT,
ADD COLUMN     "replySummary" TEXT;

-- CreateIndex
CREATE INDEX "OutreachSequence_outreachType_awaitingResponseSince_idx" ON "OutreachSequence"("outreachType", "awaitingResponseSince");
