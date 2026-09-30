-- Lets the team keep a creator off the public roster page shared with brands.
ALTER TABLE "Creator" ADD COLUMN "rosterHidden" BOOLEAN NOT NULL DEFAULT false;

-- Brand replies now get the same "needs your reply" highlight influencer replies have. A brand
-- thread still marked Replied means the team hasn't written back since (writing back moves it on),
-- so recent ones start out highlighted instead of silently missing from the new list.
UPDATE "OutreachSequence"
SET "awaitingResponseSince" = "updatedAt"
WHERE "outreachType" = 'BRAND'
  AND "status" = 'REPLIED'
  AND "stage" NOT IN ('DEAL', 'NOT_INTERESTED')
  AND "awaitingResponseSince" IS NULL
  AND "deletedAt" IS NULL
  AND "updatedAt" > NOW() - INTERVAL '30 days';
