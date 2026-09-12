-- CreateEnum
CREATE TYPE "ScheduledInitialEmailKind" AS ENUM ('SEQUENCE', 'PLAIN');

-- AlterTable
ALTER TABLE "ScheduledInitialEmail" ADD COLUMN "kind" "ScheduledInitialEmailKind" NOT NULL DEFAULT 'SEQUENCE';
