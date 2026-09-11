-- Replaces the lightweight InboxAlert notification feed with a real mirrored inbox: Gmail
-- conversations and their messages, with thread state (read/starred/archived) synced both ways.
DROP TABLE IF EXISTS "InboxAlert";

ALTER TABLE "EmailAccount" ADD COLUMN "lastHistoryId" TEXT;
ALTER TABLE "EmailAccount" ADD COLUMN "inboxSyncedAt" TIMESTAMP(3);

CREATE TABLE "InboxThread" (
    "id" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "isUnread" BOOLEAN NOT NULL DEFAULT true,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isTrashed" BOOLEAN NOT NULL DEFAULT false,
    "isSent" BOOLEAN NOT NULL DEFAULT false,
    "sequenceId" TEXT,
    "bodiesFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboxThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxThread_emailAccountId_gmailThreadId_key" ON "InboxThread"("emailAccountId", "gmailThreadId");
CREATE INDEX "InboxThread_emailAccountId_isArchived_isTrashed_lastMessageAt_idx" ON "InboxThread"("emailAccountId", "isArchived", "isTrashed", "lastMessageAt");
CREATE INDEX "InboxThread_isUnread_idx" ON "InboxThread"("isUnread");
CREATE INDEX "InboxThread_isStarred_idx" ON "InboxThread"("isStarred");
CREATE INDEX "InboxThread_sequenceId_idx" ON "InboxThread"("sequenceId");

CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT NOT NULL,
    "ccAddresses" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxMessage_threadId_gmailMessageId_key" ON "InboxMessage"("threadId", "gmailMessageId");
CREATE INDEX "InboxMessage_threadId_sentAt_idx" ON "InboxMessage"("threadId", "sentAt");

ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
