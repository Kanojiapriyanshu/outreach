-- AlterTable
ALTER TABLE "AutomationSettings" ADD COLUMN "sendWindowStartMinute" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "sendWindowEndMinute" INTEGER NOT NULL DEFAULT 0;
