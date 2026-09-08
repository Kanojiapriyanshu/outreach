-- AlterEnum
ALTER TYPE "ScheduledActionStatus" ADD VALUE 'FAILED';

-- CreateTable
CREATE TABLE "ScheduledInitialEmail" (
    "id" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "sentSequenceId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledInitialEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledInitialEmail_status_scheduledAt_idx" ON "ScheduledInitialEmail"("status", "scheduledAt");
