-- AlterTable
ALTER TABLE "AutomationSettings" ADD COLUMN     "creatorSendWindowEndHour" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN     "creatorSendWindowEndMinute" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creatorSendWindowStartHour" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "creatorSendWindowStartMinute" INTEGER NOT NULL DEFAULT 0;
