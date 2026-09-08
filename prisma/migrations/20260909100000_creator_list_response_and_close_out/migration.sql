-- AlterEnum
ALTER TYPE "SequenceStatus" ADD VALUE 'FOLLOW_UP_4_SENT';

-- AlterTable
ALTER TABLE "OutreachSequence" ADD COLUMN "creatorListResponseAt" TIMESTAMP(3);
