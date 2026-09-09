import { prisma } from "@/lib/prisma";
import {
  gmailClientFor,
  getThreadSummary,
  sendFollowUpEmail,
  getRfc822MessageId,
  looksLikeBounce,
  looksLikeAutoReply,
} from "@/lib/gmail";
import type { gmail_v1 } from "googleapis";
import { renderTemplate } from "@/lib/templates";
import { advanceState, MAX_FOLLOW_UPS, type SequenceState } from "@/lib/stateMachine";
import { addBusinessDays, addCalendarDays, clampToSendingWindow, pickRandomSendTime } from "@/lib/businessDays";
import { isUnderDailyLimit } from "@/lib/quota";
import { classifyReply } from "@/lib/replyClassifier";
import { renderNudge, maxStepsForNudge, type NudgeKind } from "@/lib/genericNudgeTemplates";
import { processScheduledInitialEmail } from "@/lib/trackSequence";
import { formatDateTime } from "@/lib/formatDate";
import type { AutomationSettings, SequenceStatus as PrismaSequenceStatus, PipelineStage } from "@/app/generated/prisma/client";

// Sequences in these statuses/stages are done for good — nothing left to watch for. Everything
// else (including REPLIED — a brand asking for the creator list, say) keeps being watched, since
// the team taking over manually (sending the list, negotiating) is itself part of the pipeline
// this system needs to keep tracking, not a reason to stop looking at the thread.
const DEAD_STATUSES: PrismaSequenceStatus[] = ["BOUNCED", "UNSUBSCRIBED", "STOPPED", "COMPLETED", "PAUSED"];
const DEAD_STAGES: PipelineStage[] = ["DEAL", "NOT_INTERESTED"];

// Manual stage overrides the team sets themselves on the dashboard — a message arriving in the
// thread should never bump the sequence backwards out of one of these into CREATOR_LIST_SENT.
export const MANUAL_OR_TERMINAL_STAGES = ["NEGOTIATION", "CREATOR_SELECTED", "DEAL", "NOT_INTERESTED"];
// Once the pipeline has moved past this point, a reply is being read in the context of "the list
// has already been sent" (CREATOR_CHOSEN) rather than "are they interested enough to want it"
// (WANTS_CREATOR_LIST).
const PRE_LIST_STAGES = ["FIRST_EMAIL_SENT", "CREATOR_LIST_REQUESTED"];

type SequenceWithContact = {
  id: string;
  threadId: string;
  outreachType: "BRAND" | "CREATOR";
  emailAccountId: string;
  lastKnownMsgCount: number;
  stage: string;
  creatorListResponseAt: Date | null;
  contact: { name: string; email: string };
};

type ThreadCheckResult =
  | { terminal: false; manualSendDetected: boolean }
  | { terminal: true; status: "REPLIED" | "BOUNCED" | "UNSUBSCRIBED" };

/**
 * Guards against double-processing the same thread event when two checks overlap (e.g. the
 * worker's own poll running at the same moment someone triggers a manual check) — both would
 * otherwise read the same "3 new messages" snapshot and each try to act on it, duplicating sends
 * and activity log entries. Only the caller whose `lastKnownMsgCount` still matches what's in the
 * database gets to proceed; the loser's update matches zero rows and it backs off silently.
 */
async function claimSequence(seq: SequenceWithContact, data: Record<string, unknown>): Promise<boolean> {
  const result = await prisma.outreachSequence.updateMany({
    where: { id: seq.id, lastKnownMsgCount: seq.lastKnownMsgCount },
    data,
  });
  return result.count === 1;
}

/**
 * Computes the next follow-up/nudge's send time from the sequence's outreach type and settings,
 * landing at a random moment inside the sending window (7-10am IST by default) instead of the
 * exact same time-of-day the previous message went out — a batch of emails landing at the
 * identical minute across different threads is an easy "this is automated" tell.
 */
export function computeNextScheduledAt(outreachType: "BRAND" | "CREATOR", step: number, settings: AutomationSettings): Date {
  // The creator-list nudge's step 4 (final close-out) isn't in the delay arrays below — it
  // reuses the same gap as step 3, so it lands at the same "regular interval" as the nudges
  // before it instead of needing its own setting.
  const delayIndex = Math.min(step, 3);
  const delayDays =
    outreachType === "BRAND"
      ? [0, settings.brandDelayDays1, settings.brandDelayDays2, settings.brandDelayDays3][delayIndex]
      : [0, settings.creatorDelayDays1, settings.creatorDelayDays2, settings.creatorDelayDays3][delayIndex];
  const target = outreachType === "BRAND" ? addBusinessDays(new Date(), delayDays) : addCalendarDays(new Date(), delayDays);
  return pickRandomSendTime(target, settings);
}

/**
 * The team typing a message directly into Gmail (e.g. sending a creator shortlist once a brand
 * replies) is itself a real pipeline event — it should reset the reply-timer and start a fresh
 * nudge cadence, exactly like Email 1 does, instead of just sitting there forever waiting on the
 * follow-up that was scheduled for the *old* message.
 */
async function handleManualOutboundMessage(
  seq: SequenceWithContact,
  message: { id: string; subject: string },
  newMessageCount: number
) {
  const claimed = await claimSequence(seq, {
    status: "WAITING_FOR_REPLY",
    currentStep: 0,
    lastKnownMsgCount: newMessageCount,
    // A fresh round of nudges starting means we're waiting on a new response — don't carry over
    // the "Response Received" marker from whatever round came before this one.
    creatorListResponseAt: null,
  });
  if (!claimed) return; // another concurrent check already picked up this same message

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const scheduledAt = computeNextScheduledAt(seq.outreachType, 1, settings);
  const stageChanges = !MANUAL_OR_TERMINAL_STAGES.includes(seq.stage) && seq.stage !== "CREATOR_LIST_SENT";

  await prisma.$transaction([
    prisma.emailMessage.create({
      data: {
        sequenceId: seq.id,
        providerMessageId: message.id,
        direction: "OUT",
        source: "MANUAL",
        subject: message.subject,
        body: "(sent directly from Gmail — not tracked by the system)",
        sentAt: new Date(),
        status: "SENT",
      },
    }),
    prisma.scheduledAction.updateMany({
      where: { sequenceId: seq.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    }),
    ...(stageChanges
      ? [prisma.outreachSequence.update({ where: { id: seq.id }, data: { stage: "CREATOR_LIST_SENT" as const } })]
      : []),
    prisma.scheduledAction.create({
      data: {
        sequenceId: seq.id,
        step: 1,
        scheduledAt,
        status: "PENDING",
        kind: "CREATOR_LIST_NUDGE",
        actionKey: `${seq.id}-manual-${message.id}`,
      },
    }),
    prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: "MANUAL_MESSAGE_DETECTED",
        description: `Spotted a message you sent directly from Gmail — restarted the reply timer. We'll nudge about the creator list if there's no reply by ${formatDateTime(scheduledAt)}.`,
      },
    }),
    ...(stageChanges
      ? [
          prisma.activityLog.create({
            data: { sequenceId: seq.id, eventType: "STAGE_CHANGED", description: "Stage set to Creator List Sent." },
          }),
        ]
      : []),
  ]);
}

/**
 * A reply that doesn't move things forward ("ok, will check and get back to you") still restarts
 * the reply-timer — just with nudge copy that asks whether they've had a chance to check
 * internally, and a shorter, configurable delay, instead of silently reusing whatever cadence was
 * already in flight.
 */
async function handleNonCommittalReply(seq: SequenceWithContact, from: string, newMessageCount: number) {
  const creatorListAlreadySent = !PRE_LIST_STAGES.includes(seq.stage);
  const claimed = await claimSequence(seq, {
    status: "WAITING_FOR_REPLY",
    currentStep: 0,
    lastKnownMsgCount: newMessageCount,
    ...(creatorListAlreadySent ? { creatorListResponseAt: new Date() } : {}),
  });
  if (!claimed) return;

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const target =
    seq.outreachType === "BRAND"
      ? addBusinessDays(new Date(), settings.nonCommittalDelayDays)
      : addCalendarDays(new Date(), settings.nonCommittalDelayDays);
  const scheduledAt = pickRandomSendTime(target, settings);

  await prisma.$transaction([
    prisma.scheduledAction.updateMany({
      where: { sequenceId: seq.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    }),
    prisma.scheduledAction.create({
      data: {
        sequenceId: seq.id,
        step: 1,
        scheduledAt,
        status: "PENDING",
        kind: "TEAM_CHECK_NUDGE",
        actionKey: `${seq.id}-noncommittal-${Date.now()}`,
      },
    }),
    prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: "GENERIC_REPLY_DETECTED",
        description: `${from} replied but didn't give a real answer — we'll check in again on ${formatDateTime(scheduledAt)} to see if they've checked internally.`,
      },
    }),
  ]);
}

/**
 * Checks a sequence's Gmail thread for anything that changes its pipeline state: a message the
 * team sent by hand (restarts the reply timer), or a reply — genuine, non-committal, wants the
 * creator list, has chosen one, auto-reply, decline, or opt-out. Shared by the continuous
 * background check (every tick, regardless of whether a follow-up is due yet) and the final
 * send-protection check right before actually sending a follow-up.
 */
async function checkThreadForTerminalEvent(
  gmail: gmail_v1.Gmail,
  seq: SequenceWithContact
): Promise<ThreadCheckResult> {
  const thread = await getThreadSummary(gmail, seq.threadId);
  const newMessages = thread.messages.slice(seq.lastKnownMsgCount);
  if (newMessages.length === 0) return { terminal: false, manualSendDetected: false };

  const knownIds = new Set(
    (await prisma.emailMessage.findMany({ where: { sequenceId: seq.id }, select: { providerMessageId: true } })).map(
      (m) => m.providerMessageId
    )
  );

  let sawOnlyAutoReplies = false;
  let msgCountSoFar = seq.lastKnownMsgCount;
  const creatorListAlreadySent = !PRE_LIST_STAGES.includes(seq.stage);

  for (const m of newMessages) {
    msgCountSoFar++;
    const fromContact = m.from.toLowerCase().includes(seq.contact.email.toLowerCase());

    if (!fromContact) {
      // Outbound message — either one this system sent (already in EmailMessage) or one the team
      // typed directly into Gmail. Only the latter is a new event worth acting on.
      if (!knownIds.has(m.id)) {
        await handleManualOutboundMessage(seq, { id: m.id, subject: m.subject }, msgCountSoFar);
        return { terminal: false, manualSendDetected: true };
      }
      continue;
    }

    if (looksLikeBounce(m)) {
      const claimed = await claimSequence(seq, { status: "BOUNCED", lastKnownMsgCount: thread.messages.length });
      if (!claimed) return { terminal: false, manualSendDetected: false }; // another check already handled this
      await prisma.$transaction([
        prisma.scheduledAction.updateMany({
          where: { sequenceId: seq.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: { sequenceId: seq.id, eventType: "BOUNCE_DETECTED", description: `The email bounced — ${m.from} isn't a working address.` },
        }),
      ]);
      return { terminal: true, status: "BOUNCED" };
    }

    if (looksLikeAutoReply(m)) {
      await prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "AUTO_REPLY_DETECTED",
          description: `Got an out-of-office auto-reply from ${m.from} — still waiting for a real answer.`,
        },
      });
      sawOnlyAutoReplies = true;
      continue;
    }

    // Beyond the header-based auto-reply heuristic above: ask the LLM classifier (if configured)
    // for the nuance a header can't catch — a real answer vs. a non-answer vs. wanting the
    // creator list vs. having chosen one vs. a decline vs. an explicit opt-out.
    const classification = await classifyReply(m.snippet, { creatorListAlreadySent });

    if (classification === "AUTO_REPLY") {
      await prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "AUTO_REPLY_DETECTED",
          description: `Got an automatic reply from ${m.from} — still waiting for a real answer.`,
        },
      });
      sawOnlyAutoReplies = true;
      continue;
    }

    if (classification === "NON_COMMITTAL") {
      await handleNonCommittalReply(seq, m.from, thread.messages.length);
      return { terminal: false, manualSendDetected: false };
    }

    if (classification === "WANTS_CREATOR_LIST") {
      const claimed = await claimSequence(seq, {
        status: "REPLIED",
        stage: "CREATOR_LIST_REQUESTED",
        lastKnownMsgCount: thread.messages.length,
        ...(creatorListAlreadySent ? { creatorListResponseAt: new Date() } : {}),
      });
      if (!claimed) return { terminal: false, manualSendDetected: false };
      await prisma.$transaction([
        prisma.scheduledAction.updateMany({
          where: { sequenceId: seq.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "REPLY_DETECTED",
            description: `${m.from} is interested and asked for the creator list — send it over from Gmail whenever you're ready.`,
          },
        }),
        prisma.activityLog.create({
          data: { sequenceId: seq.id, eventType: "STAGE_CHANGED", description: "Stage set to Creator List Requested." },
        }),
      ]);
      return { terminal: true, status: "REPLIED" };
    }

    if (classification === "CREATOR_CHOSEN") {
      const claimed = await claimSequence(seq, {
        status: "REPLIED",
        stage: "CREATOR_SELECTED",
        lastKnownMsgCount: thread.messages.length,
        ...(creatorListAlreadySent ? { creatorListResponseAt: new Date() } : {}),
      });
      if (!claimed) return { terminal: false, manualSendDetected: false };
      await prisma.$transaction([
        prisma.scheduledAction.updateMany({
          where: { sequenceId: seq.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "REPLY_DETECTED",
            description: `${m.from} picked a creator — time to negotiate and close. Follow-ups stopped.`,
          },
        }),
        prisma.activityLog.create({
          data: { sequenceId: seq.id, eventType: "STAGE_CHANGED", description: "Stage set to Creator Selected." },
        }),
      ]);
      return { terminal: true, status: "REPLIED" };
    }

    if (classification === "OPT_OUT") {
      const claimed = await claimSequence(seq, {
        status: "UNSUBSCRIBED",
        stage: "NOT_INTERESTED",
        lastKnownMsgCount: thread.messages.length,
        ...(creatorListAlreadySent ? { creatorListResponseAt: new Date() } : {}),
      });
      if (!claimed) return { terminal: false, manualSendDetected: false };
      await prisma.$transaction([
        prisma.suppressedContact.upsert({
          where: { email: seq.contact.email.toLowerCase() },
          update: {},
          create: { email: seq.contact.email.toLowerCase(), reason: "Replied asking not to be contacted" },
        }),
        prisma.scheduledAction.updateMany({
          where: { sequenceId: seq.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "UNSUBSCRIBE_DETECTED",
            description: `${m.from} asked not to be contacted again — added to the Do Not Email list.`,
          },
        }),
      ]);
      return { terminal: true, status: "UNSUBSCRIBED" };
    }

    if (classification === "UNINTERESTED") {
      const claimed = await claimSequence(seq, {
        status: "REPLIED",
        stage: "NOT_INTERESTED",
        lastKnownMsgCount: thread.messages.length,
        ...(creatorListAlreadySent ? { creatorListResponseAt: new Date() } : {}),
      });
      if (!claimed) return { terminal: false, manualSendDetected: false };
      await prisma.$transaction([
        prisma.scheduledAction.updateMany({
          where: { sequenceId: seq.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "REPLY_DETECTED",
            description: `${m.from} passed on this one — follow-ups stopped.`,
          },
        }),
      ]);
      return { terminal: true, status: "REPLIED" };
    }

    // Genuine, substantive human reply that doesn't fit any of the above — hand off to the team.
    {
      const claimed = await claimSequence(seq, {
        status: "REPLIED",
        lastKnownMsgCount: thread.messages.length,
        ...(creatorListAlreadySent ? { creatorListResponseAt: new Date() } : {}),
      });
      if (!claimed) return { terminal: false, manualSendDetected: false };
      await prisma.$transaction([
        prisma.scheduledAction.updateMany({
          where: { sequenceId: seq.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        }),
        prisma.activityLog.create({
          data: { sequenceId: seq.id, eventType: "REPLY_DETECTED", description: `${m.from} replied — follow-ups stopped.` },
        }),
      ]);
      return { terminal: true, status: "REPLIED" };
    }
  }

  if (sawOnlyAutoReplies) {
    // Advance the watermark so the same message doesn't get re-logged on every future check.
    await claimSequence(seq, { lastKnownMsgCount: thread.messages.length });
  }

  return { terminal: false, manualSendDetected: false };
}

/**
 * Checks every sequence that isn't fully done — including ones already marked REPLIED, since a
 * reply asking for the creator list (or one that names a creator) still needs its thread watched
 * for what happens next: the team sending the list by hand, or the brand's next reply — so a
 * reply/manual-send is caught within one poll interval instead of sitting unnoticed.
 */
export async function runContinuousReplyCheck() {
  const activeSequences = await prisma.outreachSequence.findMany({
    where: { status: { notIn: DEAD_STATUSES }, stage: { notIn: DEAD_STAGES } },
    include: { contact: true, emailAccount: true },
  });

  const results = [];
  for (const seq of activeSequences) {
    if (seq.emailAccount.accessStatus !== "CONNECTED") continue;
    try {
      const gmail = await gmailClientFor(seq.emailAccountId);
      const result = await checkThreadForTerminalEvent(gmail, seq);
      if (result.terminal) results.push({ sequenceId: seq.id, event: result.status });
      else if (result.manualSendDetected) results.push({ sequenceId: seq.id, event: "MANUAL_MESSAGE_DETECTED" });
    } catch (err) {
      console.error(`[continuous reply check] failed for sequence ${seq.id}:`, err);
    }
  }
  return results;
}

const NUDGE_KINDS = new Set<string>(["CREATOR_LIST_NUDGE", "TEAM_CHECK_NUDGE", "GENERIC_NUDGE"]);

type RenderableAction = {
  kind: string;
  step: number;
  templateVersion: number | null;
  subjectOverride: string | null;
  bodyOverride: string | null;
};
type RenderableSequence = {
  id: string;
  outreachType: "BRAND" | "CREATOR";
  recipientType: "DIRECT" | "AGENCY";
  variables: unknown;
  contact: { name: string };
};

/**
 * Computes what a scheduled follow-up/nudge would actually send: the team's own edit if they
 * saved one for this specific upcoming send (subjectOverride/bodyOverride), otherwise a live
 * render of whichever template/nudge content currently applies. Shared by the real send
 * (processScheduledAction) and the dashboard's "preview this follow-up" endpoint, so what's
 * previewed is always exactly what would go out.
 */
export async function renderScheduledActionContent(
  action: RenderableAction,
  seq: RenderableSequence
): Promise<{ subject: string; body: string; templateVersionUsed?: number; isOverridden: boolean } | null> {
  if (action.subjectOverride != null && action.bodyOverride != null) {
    return { subject: action.subjectOverride, body: action.bodyOverride, isOverridden: true };
  }

  if (NUDGE_KINDS.has(action.kind)) {
    const lastMessage = await prisma.emailMessage.findFirst({
      where: { sequenceId: seq.id },
      orderBy: { sentAt: "desc" },
    });
    const nudgeVariables = { ...(seq.variables as Record<string, string>), Contact_Name: seq.contact.name };
    return {
      subject: lastMessage?.subject ?? "",
      body: renderNudge(action.kind as NudgeKind, action.step, nudgeVariables),
      isOverridden: false,
    };
  }

  // A scheduled action pinned to a specific template version (PRD §26 — editing a template never
  // mutates a version already in flight) must still find that exact version even after a newer
  // edit has deactivated it — `isActive` only matters when nothing specific was pinned, i.e. this
  // is about to be scheduled fresh and should get whatever's current.
  const template = await prisma.template.findFirst({
    where: {
      outreachType: seq.outreachType,
      recipientType: seq.recipientType,
      step: action.step + 1,
      ...(action.templateVersion != null ? { version: action.templateVersion } : { isActive: true }),
    },
  });
  if (!template) return null;

  const variables = { ...(seq.variables as Record<string, string>), Contact_Name: seq.contact.name };
  return {
    subject: renderTemplate(template.subject, variables),
    body: renderTemplate(template.body, variables),
    templateVersionUsed: template.version,
    isOverridden: false,
  };
}

/**
 * Runs the full send-protection gate (PRD §45) and, if clear, sends the follow-up (or nudge) for
 * `scheduledActionId`, advances the sequence state machine, and schedules the next action. Used
 * by both the polling worker and the "Send Now" manual control.
 */
export async function processScheduledAction(
  scheduledActionId: string,
  options: { ignoreSendingWindow?: boolean } = {}
) {
  const action = await prisma.scheduledAction.findUnique({
    where: { id: scheduledActionId },
    include: {
      sequence: {
        include: {
          contact: { include: { brand: true, creator: true } },
          emailAccount: true,
        },
      },
    },
  });
  if (!action) return { skipped: true, reason: "Action not found" };

  const seq = action.sequence;

  // --- Send-protection gate (PRD §45) ---
  if (action.status !== "PENDING") return { skipped: true, reason: "Already processed" };
  if (seq.status === "PAUSED") return { skipped: true, reason: "Sequence paused" };
  if (
    ["REPLIED", "BOUNCED", "UNSUBSCRIBED", "STOPPED", "COMPLETED"].includes(seq.status)
  ) {
    return { skipped: true, reason: `Sequence is ${seq.status}` };
  }

  const suppressed = await prisma.suppressedContact.findUnique({
    where: { email: seq.contact.email.toLowerCase() },
  });
  if (suppressed) {
    await prisma.scheduledAction.update({ where: { id: action.id }, data: { status: "CANCELLED" } });
    return { skipped: true, reason: "Recipient suppressed" };
  }

  if (seq.emailAccount.accessStatus !== "CONNECTED") {
    return { skipped: true, reason: "Email account disconnected; reconnect it in Settings to resume." };
  }

  // --- Reply / bounce / auto-reply / manual-send detection (final check right before sending) ---
  const gmail = await gmailClientFor(seq.emailAccountId);

  await prisma.activityLog.create({
    data: { sequenceId: seq.id, eventType: "REPLY_CHECK_PERFORMED", description: "Checked the inbox for a reply." },
  });

  const checkResult = await checkThreadForTerminalEvent(gmail, seq);
  if (checkResult.terminal) {
    return {
      skipped: true,
      reason: checkResult.status === "REPLIED" ? "Replied" : checkResult.status === "BOUNCED" ? "Bounced" : "Unsubscribed",
    };
  }
  if (checkResult.manualSendDetected) {
    // The pending action we were about to process just got cancelled and replaced by a fresh
    // nudge cycle for the message the team just sent — nothing left to do for the old one.
    return { skipped: true, reason: "Manual message detected; follow-up cycle reset" };
  }

  await prisma.activityLog.create({
    data: { sequenceId: seq.id, eventType: "NO_REPLY_FOUND", description: "No reply yet." },
  });

  // --- Sending window check ---
  const settings = await prisma.automationSettings.findFirstOrThrow();
  const now = new Date();
  const clamped = clampToSendingWindow(now, settings);
  if (!options.ignoreSendingWindow && clamped.getTime() > now.getTime() + 60_000) {
    // Outside the window right now; push this action to the next valid moment and retry later.
    await prisma.scheduledAction.update({ where: { id: action.id }, data: { scheduledAt: clamped } });
    return { skipped: true, reason: "Outside sending window; rescheduled" };
  }

  // --- Daily sending-quota protection (avoid tripping Gmail's spam/quota flags) ---
  const underLimit = await isUnderDailyLimit(seq.emailAccountId, seq.emailAccount.dailySendLimit);
  if (!underLimit) {
    const tomorrow = clampToSendingWindow(addCalendarDays(new Date(), 1), settings);
    await prisma.scheduledAction.update({ where: { id: action.id }, data: { scheduledAt: tomorrow } });
    await prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: "FOLLOW_UP_SCHEDULED",
        description: `Hit today's sending limit (${seq.emailAccount.dailySendLimit}) for ${seq.emailAccount.email} — this follow-up moved to ${formatDateTime(tomorrow)}.`,
      },
    });
    return { skipped: true, reason: "Daily send limit reached; rescheduled" };
  }

  // --- Render the content: the team's saved edit for this send if there is one, otherwise a
  // canned step template or a context-specific nudge for a hand-typed message. No variable is
  // ever mandatory here — an unfilled or custom {tag} just goes out as literal text, the same
  // way the compose flow works, rather than blocking the send. ---
  const rendered = await renderScheduledActionContent(action, seq);
  if (!rendered) {
    return { skipped: true, reason: `No active template for step ${action.step + 1}` };
  }
  const subject = rendered.subject;
  const renderedBody = rendered.body;
  const templateVersionUsed = rendered.templateVersionUsed;

  const { messageId: rfc822MessageId, references } = await getRfc822MessageId(gmail, seq.initialMessageId);

  // Re-read the thread length right before sending — checkThreadForTerminalEvent may have
  // advanced lastKnownMsgCount (auto-replies), so use the sequence's current value, not a stale one.
  const freshSeq = await prisma.outreachSequence.findUniqueOrThrow({ where: { id: seq.id } });

  const sent = await sendFollowUpEmail(gmail, {
    to: seq.contact.email,
    subject,
    body: renderedBody,
    threadId: seq.threadId,
    inReplyToRfc822MessageId: rfc822MessageId,
    references: references ? `${references} ${rfc822MessageId}` : rfc822MessageId,
    fromEmail: seq.emailAccount.email,
  });

  const state: SequenceState = { status: seq.status as SequenceState["status"], currentStep: seq.currentStep };
  const maxSteps = NUDGE_KINDS.has(action.kind) ? maxStepsForNudge(action.kind as NudgeKind) : MAX_FOLLOW_UPS;
  const next = advanceState(state, "NO_REPLY_ADVANCE", maxSteps);

  await prisma.$transaction([
    prisma.emailMessage.create({
      data: {
        sequenceId: seq.id,
        providerMessageId: sent.id ?? "",
        direction: "OUT",
        subject,
        body: renderedBody,
        sentAt: new Date(),
        status: "SENT",
      },
    }),
    prisma.scheduledAction.update({ where: { id: action.id }, data: { status: "SENT" } }),
    prisma.outreachSequence.update({
      where: { id: seq.id },
      data: {
        status: next.status,
        currentStep: next.currentStep,
        lastKnownMsgCount: freshSeq.lastKnownMsgCount + 1,
        // Silence through all 3 follow-ups reads as "not interested" for the pipeline view too —
        // unless the team already made a manual call on this one (Negotiation/Creator
        // Selected/Deal), which should never be overwritten by the automation.
        ...(next.status === "COMPLETED" && !MANUAL_OR_TERMINAL_STAGES.includes(seq.stage)
          ? { stage: "NOT_INTERESTED" as const }
          : {}),
      },
    }),
    prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: "FOLLOW_UP_SENT",
        description: `Sent follow-up #${action.step} to ${seq.contact.email}.`,
      },
    }),
  ]);

  if (next.status === "COMPLETED") {
    await prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: "SEQUENCE_COMPLETED",
        description:
          maxSteps > MAX_FOLLOW_UPS
            ? "All creator-list nudges (including the final close-out) sent with no reply — wrapped up."
            : "All 3 follow-ups sent with no reply — wrapped up.",
      },
    });
  } else {
    const settingsForDelay = await prisma.automationSettings.findFirstOrThrow();
    // computeNextScheduledAt's step arg indexes the delay array by the step being SCHEDULED
    // (1/2/3), not the one just sent — e.g. scheduling follow-up #2 needs brandDelayDays2 (the
    // gap after follow-up #1), not brandDelayDays1 again.
    const scheduledAt = computeNextScheduledAt(seq.outreachType, next.currentStep + 1, settingsForDelay);

    await prisma.scheduledAction.create({
      data: {
        sequenceId: seq.id,
        step: next.currentStep + 1,
        scheduledAt,
        status: "PENDING",
        kind: action.kind,
        templateVersion: action.kind === "TEMPLATE" ? templateVersionUsed : null,
        actionKey: `${seq.id}-step-${next.currentStep + 1}-${action.kind}-${Date.now()}`,
      },
    });
    await prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: "FOLLOW_UP_SCHEDULED",
        description: `Follow-up #${next.currentStep + 1} is set for ${formatDateTime(scheduledAt)}.`,
      },
    });
  }

  return { sent: true };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls all due, pending scheduled actions and processes them. Entry point for the worker loop.
 * Sends are spaced out with a randomized human-like gap (configurable in Settings) instead of
 * firing every due follow-up in the same instant — a burst of identical-looking sends is one of
 * the more obvious "this is a bot" signals to a mail provider.
 */
export async function runDueScheduledActions() {
  const due = await prisma.scheduledAction.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
  });

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const results = [];

  for (let i = 0; i < due.length; i++) {
    const result = await processScheduledAction(due[i].id);
    results.push({ actionId: due[i].id, ...result });

    if (result.sent && i < due.length - 1) {
      const min = settings.sendSpacingSecondsMin;
      const max = Math.max(min, settings.sendSpacingSecondsMax);
      const gapMs = (min + Math.random() * (max - min)) * 1000;
      await sleep(gapMs);
    }
  }
  return results;
}

/**
 * Sends whatever "Write & Send" emails were scheduled for a future time (like Gmail's own
 * "Schedule send") and are now due. Spaced out the same way runDueScheduledActions is, for the
 * same reason — a burst of brand-new outreach emails landing at the identical moment looks
 * automated.
 */
export async function runDueInitialEmails() {
  const due = await prisma.scheduledInitialEmail.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
  });

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const results = [];

  for (let i = 0; i < due.length; i++) {
    const result = await processScheduledInitialEmail(due[i].id);
    results.push({ scheduledId: due[i].id, ...result });

    if ("sent" in result && result.sent && i < due.length - 1) {
      const min = settings.sendSpacingSecondsMin;
      const max = Math.max(min, settings.sendSpacingSecondsMax);
      const gapMs = (min + Math.random() * (max - min)) * 1000;
      await sleep(gapMs);
    }
  }
  return results;
}

/**
 * The full worker tick: catch replies/manual-sends on every active sequence first (not just ones
 * with a due follow-up), send whatever scheduled Email 1s are now due, then process whatever
 * follow-ups are actually due. This is what scripts/worker.ts calls on each poll.
 */
export async function runWorkerTick() {
  const replyResults = await runContinuousReplyCheck();
  const initialEmailResults = await runDueInitialEmails();
  const actionResults = await runDueScheduledActions();
  return {
    repliesFound: replyResults.length,
    initialEmailsSent: initialEmailResults.length,
    actionsProcessed: actionResults.length,
    replyResults,
    initialEmailResults,
    actionResults,
  };
}

export { MAX_FOLLOW_UPS };
