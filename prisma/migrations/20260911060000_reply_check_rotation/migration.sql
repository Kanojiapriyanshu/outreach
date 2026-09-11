-- The reply-check pass is time-bounded. Without a per-sequence "last checked" stamp to sort by,
-- it restarts from the same order every tick and anything past the cutoff is never checked once
-- there are more active sequences than fit in one pass.
ALTER TABLE "OutreachSequence" ADD COLUMN "lastReplyCheckAt" TIMESTAMP(3);
