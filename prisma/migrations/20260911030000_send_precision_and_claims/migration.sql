-- Per-pass cadence stamps + non-blocking anti-burst spacing, so the worker can tick every ~30s
-- for send precision without running the Gmail-heavy passes (or a blocking sleep) that often.
ALTER TABLE "WorkerHeartbeat" ADD COLUMN "lastReplyCheckAt" TIMESTAMP(3);
ALTER TABLE "WorkerHeartbeat" ADD COLUMN "lastInboxScanAt" TIMESTAMP(3);
ALTER TABLE "WorkerHeartbeat" ADD COLUMN "nextSendAllowedAt" TIMESTAMP(3);

-- Atomic claiming, now that ticks can overlap.
ALTER TABLE "ScheduledAction" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "ScheduledInitialEmail" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- A hand-picked send time is a decision, not a suggestion — these skip the sending-window clamp.
ALTER TABLE "ScheduledAction" ADD COLUMN "manuallyScheduled" BOOLEAN NOT NULL DEFAULT false;

-- Makes "scheduled for X, actually sent at Y" directly answerable.
ALTER TABLE "ScheduledInitialEmail" ADD COLUMN "sentAt" TIMESTAMP(3);
