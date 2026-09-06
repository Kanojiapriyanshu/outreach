Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OutreachType" AS ENUM ('BRAND', 'CREATOR');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('DIRECT', 'AGENCY');

-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('FLAT_FEE', 'COMMISSION', 'PRODUCT_ONLY', 'HYBRID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'OUTLOOK');

-- CreateEnum
CREATE TYPE "EmailAccessStatus" AS ENUM ('CONNECTED', 'NEEDS_REAUTH', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SequenceStatus" AS ENUM ('NEW', 'INITIAL_EMAIL_DETECTED', 'WAITING_FOR_REPLY', 'FOLLOW_UP_1_SENT', 'FOLLOW_UP_2_SENT', 'FOLLOW_UP_3_SENT', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'STOPPED', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('FIRST_EMAIL_SENT', 'CREATOR_LIST_REQUESTED', 'CREATOR_LIST_SENT', 'NEGOTIATION', 'CREATOR_SELECTED', 'NOT_INTERESTED', 'DEAL');

-- CreateEnum
CREATE TYPE "ScheduledActionKind" AS ENUM ('TEMPLATE', 'CREATOR_LIST_NUDGE', 'TEAM_CHECK_NUDGE', 'GENERIC_NUDGE');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('SYSTEM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScheduledActionStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUT', 'IN');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('SEQUENCE_CREATED', 'INITIAL_EMAIL_DETECTED', 'FOLLOW_UP_SCHEDULED', 'REPLY_CHECK_PERFORMED', 'NO_REPLY_FOUND', 'FOLLOW_UP_SENT', 'REPLY_DETECTED', 'AUTO_REPLY_DETECTED', 'BOUNCE_DETECTED', 'UNSUBSCRIBE_DETECTED', 'SEQUENCE_PAUSED', 'SEQUENCE_RESUMED', 'SEQUENCE_STOPPED', 'FOLLOW_UP_SKIPPED', 'FOLLOW_UP_SENT_NOW', 'SEQUENCE_COMPLETED', 'TEMPLATE_EDITED', 'MANUAL_MESSAGE_DETECTED', 'GENERIC_REPLY_DETECTED', 'STAGE_CHANGED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'GMAIL',
    "email" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "accessStatus" "EmailAccessStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "dailySendLimit" INTEGER NOT NULL DEFAULT 450,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "category" TEXT,
    "isAgency" BOOLEAN NOT NULL DEFAULT false,
    "budgetRangeText" TEXT,
    "budgetType" "BudgetType" NOT NULL DEFAULT 'UNKNOWN',
    "influencerRangeMin" INTEGER,
    "influencerRangeMax" INTEGER,
    "deliverables" TEXT,
    "campaignTimeline" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "channelName" TEXT,
    "channelUrl" TEXT,
    "niche" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "creatorId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSequence" (
    "id" TEXT NOT NULL,
    "outreachType" "OutreachType" NOT NULL,
    "recipientType" "RecipientType" NOT NULL DEFAULT 'DIRECT',
    "contactId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "initialMessageId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" "SequenceStatus" NOT NULL DEFAULT 'NEW',
    "stage" "PipelineStage" NOT NULL DEFAULT 'FIRST_EMAIL_SENT',
    "lastKnownMsgCount" INTEGER NOT NULL DEFAULT 1,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledAction" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "ScheduledActionKind" NOT NULL DEFAULT 'TEMPLATE',
    "templateVersion" INTEGER,
    "actionKey" TEXT NOT NULL,

    CONSTRAINT "ScheduledAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "source" "MessageSource" NOT NULL DEFAULT 'SYSTEM',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "outreachType" "OutreachType" NOT NULL,
    "recipientType" "RecipientType" NOT NULL DEFAULT 'DIRECT',
    "step" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT,
    "eventType" "ActivityEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressedContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressedContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunOk" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "actionsChecked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationSettings" (
    "id" TEXT NOT NULL,
    "brandDelayDays1" INTEGER NOT NULL DEFAULT 3,
    "brandDelayDays2" INTEGER NOT NULL DEFAULT 4,
    "brandDelayDays3" INTEGER NOT NULL DEFAULT 5,
    "creatorDelayDays1" INTEGER NOT NULL DEFAULT 2,
    "creatorDelayDays2" INTEGER NOT NULL DEFAULT 3,
    "creatorDelayDays3" INTEGER NOT NULL DEFAULT 4,
    "sendWindowStartHour" INTEGER NOT NULL DEFAULT 7,
    "sendWindowEndHour" INTEGER NOT NULL DEFAULT 10,
    "sendWindowDays" TEXT NOT NULL DEFAULT 'MON,TUE,WED,THU,FRI',
    "sendSpacingSecondsMin" INTEGER NOT NULL DEFAULT 30,
    "sendSpacingSecondsMax" INTEGER NOT NULL DEFAULT 180,
    "nonCommittalDelayDays" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_email_key" ON "EmailAccount"("email");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSequence_emailAccountId_threadId_key" ON "OutreachSequence"("emailAccountId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledAction_actionKey_key" ON "ScheduledAction"("actionKey");

-- CreateIndex
CREATE INDEX "ScheduledAction_status_scheduledAt_idx" ON "ScheduledAction"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "EmailMessage_sequenceId_idx" ON "EmailMessage"("sequenceId");

-- CreateIndex
CREATE INDEX "Template_outreachType_recipientType_step_isActive_idx" ON "Template"("outreachType", "recipientType", "step", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Template_outreachType_recipientType_step_version_key" ON "Template"("outreachType", "recipientType", "step", "version");

-- CreateIndex
CREATE INDEX "ActivityLog_sequenceId_idx" ON "ActivityLog"("sequenceId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressedContact_email_key" ON "SuppressedContact"("email");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSequence" ADD CONSTRAINT "OutreachSequence_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSequence" ADD CONSTRAINT "OutreachSequence_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

