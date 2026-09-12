import { prisma } from "@/lib/prisma";
import { renderTemplate, variablesForType } from "@/lib/templates";
import { gmailClientFor, sendInitialEmail, sendRichEmail, htmlToPlainText, type OutgoingAttachment } from "@/lib/gmail";
import { isUnderDailyLimit } from "@/lib/quota";
import { computeNextScheduledAt } from "@/lib/scheduler";
import { addCalendarDays, clampToSendingWindow } from "@/lib/businessDays";
import { MAX_FOLLOW_UPS, type SequenceStatus } from "@/lib/stateMachine";
import { formatDateTime } from "@/lib/formatDate";

export type RecipientType = "DIRECT" | "AGENCY";

interface BrandInput {
  name: string;
  /** The CLIENT brand/product/campaign name referenced inside the email — only differs from
   * `name` for agency outreach, where `name` is the agency itself. Falls back to `name` when
   * omitted (the normal direct-to-brand case, where the brand IS the campaign). */
  campaignName?: string;
  website?: string;
  category?: string;
  budgetRangeText?: string;
  budgetType?: "FLAT_FEE" | "COMMISSION" | "PRODUCT_ONLY" | "HYBRID" | "UNKNOWN";
  influencerRangeMin?: number;
  influencerRangeMax?: number;
  deliverables?: string;
  campaignTimeline?: string;
}

interface ContactInput {
  outreachType: "BRAND" | "CREATOR";
  recipientType?: RecipientType;
  emailAccountId: string;
  contactEmail: string;
  contactName: string;
  brand?: BrandInput;
  creator?: { name: string; channelName?: string; channelUrl?: string; niche?: string };
  variables: Record<string, string>;
}

export interface TrackEmailInput extends ContactInput {
  threadId: string;
  initialMessageId: string;
  subject: string;
  /** How many follow-ups the team already sent themselves from Gmail before attaching this
   * thread — 0 means none yet (schedule follow-up #1 as usual). Only meaningful for the
   * "already sent it" attach flow; composeAndSendInitialEmail/scheduleInitialEmail always start
   * fresh, since the CRM itself is the one sending Email 1 there. */
  startingStep?: number;
  /** ISO datetime — when set, overrides the automatic business-day/window calculation for the
   * next follow-up (the one right after startingStep) with this exact moment instead. Lets the
   * team pick their own timing for a thread they're attaching rather than always getting
   * whatever the automatic cadence would compute. */
  manualScheduledAt?: string;
}

export type TrackEmailResult =
  | { ok: true; sequenceId: string; duplicate: boolean }
  | { ok: false; error: string };

/**
 * Only the brand/creator's own name is ever required — it's what the Brand/Creator/Contact
 * database rows are keyed on, not just template content. Every {Variable} a template references
 * is genuinely optional: the team can fill in as much or as little as is actually relevant to a
 * given outreach and send anyway (deriveVariables below fills anything left blank with an empty
 * string so it never renders as a literal, unreplaced "{Tag}" in the sent email).
 */
async function checkPrerequisites(input: ContactInput): Promise<string | null> {
  if (input.outreachType === "BRAND" && !input.brand?.name) return "Brand name is required";
  if (input.outreachType === "CREATOR" && !input.creator?.name) return "Creator name is required";
  return null;
}

/**
 * Merges the free-form template variables with the ones we already know from structured fields,
 * filling in every other variable this outreach type's templates might reference with an empty
 * string — so a field the team left blank just renders as nothing, never as a stray "{Tag}".
 */
function deriveVariables(input: ContactInput): Record<string, string> {
  const defaults = Object.fromEntries(variablesForType(input.outreachType).map((v) => [v, ""]));
  const derived: Record<string, string> = { Contact_Name: input.contactName };
  if (input.outreachType === "BRAND" && input.brand?.name) {
    derived.Brand_Or_Campaign_Name = input.brand.campaignName || input.brand.name;
  }
  if (input.outreachType === "CREATOR" && input.creator?.name) derived.Creator_Name = input.creator.name;
  return { ...defaults, ...input.variables, ...derived };
}

/** Creates the Brand/Creator + Contact row for this outreach, reused by both entry points. */
async function createContact(input: ContactInput) {
  if (input.outreachType === "BRAND") {
    const b = input.brand!;
    const brand = await prisma.brand.create({
      data: {
        name: b.name,
        website: b.website,
        category: b.category,
        isAgency: input.recipientType === "AGENCY",
        budgetRangeText: b.budgetRangeText,
        budgetType: b.budgetType ?? "UNKNOWN",
        influencerRangeMin: b.influencerRangeMin,
        influencerRangeMax: b.influencerRangeMax,
        deliverables: b.deliverables,
        campaignTimeline: b.campaignTimeline,
      },
    });
    return prisma.contact.create({
      data: { brandId: brand.id, name: input.contactName, email: input.contactEmail.toLowerCase() },
    });
  }
  const creator = await prisma.creator.create({
    data: {
      name: input.creator!.name,
      email: input.contactEmail.toLowerCase(),
      channelName: input.creator!.channelName,
      channelUrl: input.creator!.channelUrl,
      niche: input.creator!.niche,
    },
  });
  return prisma.contact.create({
    data: { creatorId: creator.id, name: input.contactName, email: input.contactEmail.toLowerCase() },
  });
}

function stepStatus(step: number): SequenceStatus {
  if (step === 0) return "WAITING_FOR_REPLY";
  if (step >= MAX_FOLLOW_UPS) return "COMPLETED";
  return `FOLLOW_UP_${step}_SENT` as SequenceStatus;
}

/** Creates the sequence + Email 1 message record + first follow-up schedule. Shared tail of both flows. */
async function finalizeSequence(
  input: ContactInput & {
    threadId: string;
    initialMessageId: string;
    subject: string;
    body: string;
    startingStep?: number;
    manualScheduledAt?: string;
  },
  contactId: string
) {
  const recipientType = input.recipientType ?? "DIRECT";
  // How many follow-ups the team already sent by hand before attaching this thread — 0 for the
  // normal case (nothing sent yet), up to MAX_FOLLOW_UPS if they'd already gone through the
  // whole cadence themselves.
  const startingStep = Math.max(0, Math.min(input.startingStep ?? 0, MAX_FOLLOW_UPS));

  const sequence = await prisma.outreachSequence.create({
    data: {
      outreachType: input.outreachType,
      recipientType,
      contactId,
      emailAccountId: input.emailAccountId,
      threadId: input.threadId,
      initialMessageId: input.initialMessageId,
      currentStep: startingStep,
      status: stepStatus(startingStep),
      // The automation's own natural completion (3 follow-ups, no reply) also moves the pipeline
      // stage to Not Interested — mirror that here for a sequence attached already at that point,
      // so it doesn't sit shown as "First Email Sent" despite being done.
      stage: startingStep >= MAX_FOLLOW_UPS ? "NOT_INTERESTED" : undefined,
      variables: deriveVariables(input),
    },
  });

  await prisma.emailMessage.create({
    data: {
      sequenceId: sequence.id,
      providerMessageId: input.initialMessageId,
      direction: "OUT",
      subject: input.subject,
      body: input.body,
      sentAt: new Date(),
      status: "SENT",
    },
  });

  await prisma.activityLog.create({
    data: {
      sequenceId: sequence.id,
      eventType: "SEQUENCE_CREATED",
      description:
        startingStep > 0
          ? `Started tracking ${input.contactEmail} — picking up after follow-up #${startingStep}, already sent by hand.`
          : `Started tracking ${input.contactEmail}.`,
    },
  });

  if (startingStep >= MAX_FOLLOW_UPS) {
    // All 3 follow-ups were already sent manually with no reply by the time this got attached —
    // nothing left to schedule; this mirrors what the automation would have done on its own.
    await prisma.activityLog.create({
      data: {
        sequenceId: sequence.id,
        eventType: "SEQUENCE_COMPLETED",
        description: "All 3 follow-ups were already sent by hand with no reply — nothing left to schedule.",
      },
    });
    return sequence.id;
  }

  const nextStep = startingStep + 1;
  const settings = await prisma.automationSettings.findFirstOrThrow();
  const manualDate = input.manualScheduledAt ? new Date(input.manualScheduledAt) : null;
  const pickedByHand = !!(manualDate && !isNaN(manualDate.getTime()));
  const scheduledAt = pickedByHand ? manualDate! : computeNextScheduledAt(input.outreachType, nextStep, settings);

  // Template.step N+1 = "Follow-Up N" (step 1 is Email 1) — look up its current active version
  // so an edited-since-seed template isn't silently skipped over.
  const followUpTemplate = await prisma.template.findFirst({
    where: { outreachType: input.outreachType, recipientType, step: nextStep + 1, isActive: true },
  });

  await prisma.scheduledAction.create({
    data: {
      sequenceId: sequence.id,
      step: nextStep,
      scheduledAt,
      status: "PENDING",
      templateVersion: followUpTemplate?.version ?? 1,
      actionKey: `${sequence.id}-step-${nextStep}`,
      manuallyScheduled: pickedByHand,
    },
  });

  await prisma.activityLog.create({
    data: {
      sequenceId: sequence.id,
      eventType: "FOLLOW_UP_SCHEDULED",
      description:
        manualDate && !isNaN(manualDate.getTime())
          ? `Follow-up #${nextStep} is set for ${formatDateTime(scheduledAt)} (picked by hand).`
          : `Follow-up #${nextStep} is set for ${formatDateTime(scheduledAt)}.`,
    },
  });

  return sequence.id;
}

/**
 * Creates (or returns the existing) OutreachSequence for a manually-sent Email 1.
 * Used when the user already sent Email 1 themselves from Gmail and is attaching that
 * existing thread to the automation.
 */
export async function trackSequence(input: TrackEmailInput): Promise<TrackEmailResult> {
  if (!input.outreachType || !input.emailAccountId || !input.threadId || !input.initialMessageId) {
    return { ok: false, error: "Missing required fields" };
  }

  const suppressed = await prisma.suppressedContact.findUnique({
    where: { email: input.contactEmail.toLowerCase() },
  });
  if (suppressed) {
    return { ok: false, error: `${input.contactEmail} is suppressed and cannot be tracked.` };
  }

  // Duplicate protection (PRD §44)
  const existing = await prisma.outreachSequence.findUnique({
    where: { emailAccountId_threadId: { emailAccountId: input.emailAccountId, threadId: input.threadId } },
  });
  if (existing) {
    return { ok: true, sequenceId: existing.id, duplicate: true };
  }

  const prereqError = await checkPrerequisites(input);
  if (prereqError) return { ok: false, error: prereqError };

  const contact = await createContact(input);
  const sequenceId = await finalizeSequence(
    { ...input, body: "(sent manually — body not captured)" },
    contact.id
  );

  return { ok: true, sequenceId, duplicate: false };
}

export interface ComposeEmailInput extends ContactInput {
  templateOverrideSubject?: string;
  templateOverrideBody?: string;
  /** Set when this came from the inbox's rich-text Compose window rather than the guided New
   * Outreach form — sent via sendRichEmail (preserving formatting/attachments/Cc/Bcc) instead of
   * the plain-text-only sendInitialEmail the guided flow's templates use. templateOverrideBody
   * still gets a plain-text copy for the EmailMessage activity record either way. */
  html?: string;
  cc?: string;
  bcc?: string;
  attachments?: OutgoingAttachment[];
}

export type ComposeEmailResult =
  | { ok: true; sequenceId: string }
  | { ok: false; error: string };

/**
 * Renders the active Email 1 template, sends it directly through the connected Gmail account,
 * and creates the sequence from the send result — for when the CRM itself is doing the sending
 * instead of the user manually composing in Gmail first.
 */
export async function composeAndSendInitialEmail(input: ComposeEmailInput): Promise<ComposeEmailResult> {
  const recipientType = input.recipientType ?? "DIRECT";

  const suppressed = await prisma.suppressedContact.findUnique({
    where: { email: input.contactEmail.toLowerCase() },
  });
  if (suppressed) {
    return { ok: false, error: `${input.contactEmail} is suppressed and cannot be emailed.` };
  }

  // Guard against accidentally emailing the same person twice while they already have an
  // open sequence — attach-existing has thread-based duplicate protection; compose creates a
  // brand-new thread every time, so this checks by contact identity instead.
  const activeExisting = await prisma.outreachSequence.findFirst({
    where: {
      contact: { email: input.contactEmail.toLowerCase() },
      status: { notIn: ["REPLIED", "BOUNCED", "UNSUBSCRIBED", "STOPPED", "COMPLETED"] },
    },
  });
  if (activeExisting) {
    return {
      ok: false,
      error: `${input.contactEmail} already has an active sequence (id ${activeExisting.id}). Stop it first if you want to start a new one.`,
    };
  }

  const prereqError = await checkPrerequisites(input);
  if (prereqError) return { ok: false, error: prereqError };

  const emailAccount = await prisma.emailAccount.findUnique({ where: { id: input.emailAccountId } });
  if (!emailAccount || emailAccount.accessStatus !== "CONNECTED") {
    return { ok: false, error: "Email account is not connected" };
  }

  const underLimit = await isUnderDailyLimit(input.emailAccountId, emailAccount.dailySendLimit);
  if (!underLimit) {
    return { ok: false, error: `Daily send limit (${emailAccount.dailySendLimit}) reached for ${emailAccount.email}. Try again tomorrow.` };
  }

  const template = await prisma.template.findFirst({
    where: { outreachType: input.outreachType, recipientType, step: 1, isActive: true },
  });
  if (!template) return { ok: false, error: "No active Email 1 template found for this outreach type" };

  const variables = deriveVariables(input);
  // Everything a template might reference already resolves to a real value or an empty string
  // (see deriveVariables) — a template override the team typed by hand is sent exactly as
  // written, curly braces and all, if that's what they put there. Nothing here blocks a send.
  const subject = input.templateOverrideSubject ?? renderTemplate(template.subject, variables);
  const body = input.html ? htmlToPlainText(input.html) : (input.templateOverrideBody ?? renderTemplate(template.body, variables));

  const gmail = await gmailClientFor(input.emailAccountId);
  let sent;
  try {
    sent = input.html
      ? await sendRichEmail(gmail, { to: input.contactEmail, cc: input.cc, bcc: input.bcc, subject, html: input.html, attachments: input.attachments })
      : await sendInitialEmail(gmail, { to: input.contactEmail, subject, body, fromEmail: emailAccount.email });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `Gmail send failed: ${e.message}` : "Gmail send failed" };
  }
  if (!sent.id || !sent.threadId) {
    return { ok: false, error: "Gmail did not return a message/thread id" };
  }

  const contact = await createContact(input);
  const sequenceId = await finalizeSequence(
    { ...input, threadId: sent.threadId, initialMessageId: sent.id, subject, body },
    contact.id
  );

  await prisma.activityLog.create({
    data: {
      sequenceId,
      eventType: "SEQUENCE_CREATED",
      description: `Sent the first email to ${input.contactEmail}.`,
    },
  });

  return { ok: true, sequenceId };
}

export type ScheduleInitialEmailResult =
  | { ok: true; scheduledId: string; scheduledAt: Date }
  | { ok: false; error: string };

/**
 * Like composeAndSendInitialEmail, but for a future send time instead of right now — the same
 * "Gmail schedule send" idea. Runs the same up-front checks (suppression, duplicate active
 * sequence, required variables) so a doomed send fails immediately with a clear reason instead
 * of silently failing hours later when the scheduled time arrives; the actual send still
 * re-validates then too, since state (e.g. suppression) can change in the meantime.
 */
export async function scheduleInitialEmail(
  input: ComposeEmailInput,
  scheduledAt: Date
): Promise<ScheduleInitialEmailResult> {
  const suppressed = await prisma.suppressedContact.findUnique({
    where: { email: input.contactEmail.toLowerCase() },
  });
  if (suppressed) {
    return { ok: false, error: `${input.contactEmail} is suppressed and cannot be emailed.` };
  }

  const activeExisting = await prisma.outreachSequence.findFirst({
    where: {
      contact: { email: input.contactEmail.toLowerCase() },
      status: { notIn: ["REPLIED", "BOUNCED", "UNSUBSCRIBED", "STOPPED", "COMPLETED"] },
    },
  });
  if (activeExisting) {
    return {
      ok: false,
      error: `${input.contactEmail} already has an active sequence (id ${activeExisting.id}). Stop it first if you want to start a new one.`,
    };
  }

  const prereqError = await checkPrerequisites(input);
  if (prereqError) return { ok: false, error: prereqError };

  const scheduled = await prisma.scheduledInitialEmail.create({
    data: { scheduledAt, status: "PENDING", kind: "SEQUENCE", payload: input as object },
  });

  return { ok: true, scheduledId: scheduled.id, scheduledAt };
}

/** A brand-new email the outbound classifier read as neither brand nor creator outreach (or that
 * the person composing it overrode to "just an email") — no Brand/Creator/Contact rows, no
 * sequence, no follow-ups. Still goes through the same due-scan/claim/worker machinery as a
 * SEQUENCE row so Gmail-style schedule send works identically either way; see
 * ScheduledInitialEmailKind for how the two are told apart when a row comes due. */
export interface PlainEmailInput {
  emailAccountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments?: OutgoingAttachment[];
}

export type SchedulePlainEmailResult = { ok: true; scheduledId: string; scheduledAt: Date } | { ok: false; error: string };

export async function schedulePlainEmail(input: PlainEmailInput, scheduledAt: Date): Promise<SchedulePlainEmailResult> {
  const recipients = input.to.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const suppressed = await prisma.suppressedContact.findFirst({ where: { email: { in: recipients } } });
  if (suppressed) return { ok: false, error: `${suppressed.email} has opted out and can't be emailed.` };

  const scheduled = await prisma.scheduledInitialEmail.create({
    data: { scheduledAt, status: "PENDING", kind: "PLAIN", payload: input as object },
  });
  return { ok: true, scheduledId: scheduled.id, scheduledAt };
}

/** How long a tick can hold this row before another tick assumes it died mid-send. Mirrors
 * CLAIM_STALE_MS in lib/scheduler.ts. */
const CLAIM_STALE_MS = 5 * 60 * 1000;

/** Sends one due ScheduledInitialEmail through the normal compose-and-send path. */
export async function processScheduledInitialEmail(scheduledId: string) {
  // Ticks overlap (the worker loops every ~30s), so take exclusive ownership before doing any
  // Gmail work — a plain read-then-send would let two ticks both see PENDING and send twice.
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
  const claim = await prisma.scheduledInitialEmail.updateMany({
    where: { id: scheduledId, status: "PENDING", OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }] },
    data: { claimedAt: new Date() },
  });
  if (claim.count !== 1) return { skipped: true, reason: "Already being processed" };

  try {
    return await sendClaimedInitialEmail(scheduledId);
  } finally {
    // Only matters if it's still pending — a row that sent or failed is no longer PENDING.
    await prisma.scheduledInitialEmail.updateMany({
      where: { id: scheduledId, status: "PENDING" },
      data: { claimedAt: null },
    });
  }
}

async function sendClaimedInitialEmail(scheduledId: string) {
  const scheduled = await prisma.scheduledInitialEmail.findUnique({ where: { id: scheduledId } });
  if (!scheduled || scheduled.status !== "PENDING") return { skipped: true };

  if (scheduled.kind === "PLAIN") {
    return sendClaimedPlainEmail(scheduled.id, scheduled.payload as unknown as PlainEmailInput);
  }

  const payload = scheduled.payload as unknown as ComposeEmailInput;

  // Check the daily quota ourselves before attempting the send, and self-heal by pushing this to
  // the next sending window instead of letting composeAndSendInitialEmail's generic "reached the
  // limit" error mark it FAILED below. FAILED is terminal — the worker only ever looks at PENDING
  // rows — so a scheduled Email 1 that happened to land on a day the account had already hit its
  // quota would silently never go out, even the next day. processScheduledAction (the follow-up
  // equivalent) already reschedules-to-tomorrow instead of failing for exactly this reason; this
  // mirrors that.
  const emailAccount = await prisma.emailAccount.findUnique({ where: { id: payload.emailAccountId } });
  if (emailAccount && emailAccount.accessStatus === "CONNECTED") {
    const underLimit = await isUnderDailyLimit(emailAccount.id, emailAccount.dailySendLimit);
    if (!underLimit) {
      const settings = await prisma.automationSettings.findFirstOrThrow();
      const tomorrow = clampToSendingWindow(addCalendarDays(new Date(), 1), settings);
      await prisma.scheduledInitialEmail.update({ where: { id: scheduled.id }, data: { scheduledAt: tomorrow } });
      return { skipped: true, reason: `Daily send limit reached for ${emailAccount.email}; rescheduled to ${formatDateTime(tomorrow)}` };
    }
  }

  const result = await composeAndSendInitialEmail(payload);

  if (result.ok) {
    await prisma.scheduledInitialEmail.update({
      where: { id: scheduled.id },
      data: { status: "SENT", sentSequenceId: result.sequenceId, sentAt: new Date() },
    });
    return { sent: true, sequenceId: result.sequenceId };
  }

  await prisma.scheduledInitialEmail.update({
    where: { id: scheduled.id },
    data: { status: "FAILED", error: result.error },
  });
  return { sent: false, error: result.error };
}

/** The PLAIN-kind counterpart to sendClaimedInitialEmail — same quota self-heal, but sends via
 * sendRichEmail directly with no Contact/Brand/Creator/sequence involved. */
async function sendClaimedPlainEmail(scheduledId: string, payload: PlainEmailInput) {
  const emailAccount = await prisma.emailAccount.findUnique({ where: { id: payload.emailAccountId } });
  if (!emailAccount || emailAccount.accessStatus !== "CONNECTED") {
    await prisma.scheduledInitialEmail.update({
      where: { id: scheduledId },
      data: { status: "FAILED", error: "Email account is no longer connected" },
    });
    return { sent: false, error: "Email account is no longer connected" };
  }

  const underLimit = await isUnderDailyLimit(emailAccount.id, emailAccount.dailySendLimit);
  if (!underLimit) {
    const settings = await prisma.automationSettings.findFirstOrThrow();
    const tomorrow = clampToSendingWindow(addCalendarDays(new Date(), 1), settings);
    await prisma.scheduledInitialEmail.update({ where: { id: scheduledId }, data: { scheduledAt: tomorrow } });
    return { skipped: true, reason: `Daily send limit reached for ${emailAccount.email}; rescheduled to ${formatDateTime(tomorrow)}` };
  }

  try {
    const gmail = await gmailClientFor(emailAccount.id);
    await sendRichEmail(gmail, {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      html: payload.html,
      attachments: payload.attachments,
    });
    await prisma.scheduledInitialEmail.update({ where: { id: scheduledId }, data: { status: "SENT", sentAt: new Date() } });
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? `Gmail send failed: ${e.message}` : "Gmail send failed";
    await prisma.scheduledInitialEmail.update({ where: { id: scheduledId }, data: { status: "FAILED", error: message } });
    return { sent: false, error: message };
  }
}
