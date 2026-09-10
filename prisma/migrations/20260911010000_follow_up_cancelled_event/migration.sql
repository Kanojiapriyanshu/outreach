-- Adds a distinct activity-log event for cancelling a pending follow-up (as opposed to skipping
-- one, which already exists and advances the sequence to the next step) — cancelling just stops
-- this one, with no automatic next step, so it needs its own log wording.
ALTER TYPE "ActivityEventType" ADD VALUE 'FOLLOW_UP_CANCELLED';
