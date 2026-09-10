-- New inbound Gmail messages that don't belong to any tracked OutreachSequence thread — surfaced
-- in the notifications bell by the inbox-watch pass so nothing lands in Gmail unnoticed.
CREATE TABLE "InboxAlert" (
    "id" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "InboxAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxAlert_emailAccountId_gmailMessageId_key" ON "InboxAlert"("emailAccountId", "gmailMessageId");

CREATE INDEX "InboxAlert_dismissedAt_receivedAt_idx" ON "InboxAlert"("dismissedAt", "receivedAt");

ALTER TABLE "InboxAlert" ADD CONSTRAINT "InboxAlert_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
