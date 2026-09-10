-- AlterTable
ALTER TABLE "OutreachSequence" ADD COLUMN "isImportant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OutreachSequence_deletedAt_idx" ON "OutreachSequence"("deletedAt");

-- CreateIndex
CREATE INDEX "OutreachSequence_isImportant_idx" ON "OutreachSequence"("isImportant");

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "outreachType" "OutreachType" NOT NULL,
    "recipientType" "RecipientType" NOT NULL DEFAULT 'DIRECT',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "emailAccountId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Draft_updatedAt_idx" ON "Draft"("updatedAt");
