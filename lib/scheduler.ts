import { prisma } from "@/lib/prisma";
import {
  gmailClientFor,
  getThreadSummary,
  getThreadFullText,
  sendFollowUpEmail,
  getRfc822MessageId,
  looksLikeBounce,
  looksLikeAutoReply,
} from "@/lib/gmail";
import { analyzeCreatorReply } from "@/lib/creatorReplyAI";
import {
  findEmailAddresses,
  formatRate,
  mergeRates,
  parseStoredRates,
  primaryRate,
  type CreatorReplyAnalysis,
} from "@/lib/creatorReplyAnalysis";
import { requestCreatorMediaKit, syncCreatorRateFromSequence } from "@/lib/creatorProfileSync";
import { emailAddressOf, ownSenderMatcher } from "@/lib/senderIdentity";
import { isTrackingNotification } from "@/lib/trackingSenders";
import type { gmail_v1 } from "googleapis";
import { renderTemplate } from "@/lib/templates";
import { advanceState, MAX_FOLLOW_UPS, MANUAL_OR_TERMINAL_STAGES, stageAfterSilence, type SequenceState } from "@/lib/stateMachine";
import { addBusinessDays, addCalendarDays, clampToSendingWindow, pickRandomSendTime, sendingWindowFor } from "@/lib/businessDays";
import { isUnderDailyLimit } from "@/lib/quota";
import { classifyReply } from "@/lib/replyClassifier";
import { renderNudge, maxStepsForNudge, type NudgeKind } from "@/lib/genericNudgeTemplates";
import { processScheduledInitialEmail } from "@/lib/trackSequence";
import { syncInbox } from "@/lib/inboxSync";
import { formatDateTime } from "@/lib/formatDate";
import type { AutomationSettings, SequenceStatus as PrismaSequenceStatus, PipelineStage, Prisma } from "@/app/generated/prisma/client";

// Sequences in these statuses/stages are done for good — nothing left to watch for. Everything
// else (including REPLIED — a brand asking for the creator list, say) keeps being watched, since
// the team taking over manually (sending the list, negotiating) is itself part of the pipeline
// this system needs to keep tracking, not a reason to stop looking at the thread.
const DEAD_STATUSES: PrismaSequenceStatus[] = ["BOUNCED", "UNSUBSCRIBED", "STOPPED", "COMPLETED", "PAUSED"];
const DEAD_STAGES: PipelineStage[] = ["DEAL", "NOT_INTERESTED"];

export { MANUAL_OR_TERMINAL_STAGES, stageAfterSilence };

/**
 * Threads the automation wrapped up because nobody answered the follow-ups. The regular reply
 * check stops watching them, but people answer late — a creator quoting a rate days after the last
 * follow-up is common — and a reply nobody reads leaves them showing as Not Interested. So they're
 * still read: in a slow background sweep (runDormantReplyCheck), and straight away whenever the
 * inbox sync sees their thread change. A thread the team closed as Not Interested by hand, or
 * marked as a Deal, is left alone.
 */
export const DORMANT_WHERE: Prisma.OutreachSequenceWhereInput = {
  deletedAt: null,
  status: "COMPLETED",
  stage: { not: "DEAL" },
  OR: [
    { stage: { not: "NOT_INTERESTED" } },
    { activityLogs: { none: { eventType: "STAGE_CHANGED", description: { startsWith: "Stage set to Not Interested" } } } },
  ],
};
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
  currentStep: number;
  creatorListResponseAt: Date | null;
  lastReplyAt: Date | null;
  quotedRateAt: Date | null;
  quotedRates: unknown;
  contact: { name: string; email: string };
};

type ThreadCheckResult =
  // `rescheduled`: a "will get back to you" reply just replaced the pending follow-up with a later
  // check-in — whatever send was about to happen must not go out now.
  | { terminal: false; manualSendDetected: boolean; rescheduled?: boolean }
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
  // Influencer follow-ups use exactly the brand gaps (working days); only the time of day differs —
  // they're timed into the influencer window (evenings IST by default).
  const delayDays = [0, settings.brandDelayDays1, settings.brandDelayDays2, settings.brandDelayDays3][delayIndex];
  return pickRandomSendTime(addBusinessDays(new Date(), delayDays), sendingWindowFor(outreachType, settings));
}

/**
 * The team typing a message directly into Gmail (e.g. sending a creator shortlist once a brand
 * replies) is itself a real pipeline event — it should reset the reply-timer and start a fresh
 * nudge cadence, exactly like Email 1 does, instead of just sitting there forever waiting on the
 * follow-up that was scheduled for the *old* message.
 *
 * The exception is an influencer who has already quoted a price: see `rateOnFile` below.
 */
async function handleManualOutboundMessage(
  seq: SequenceWithContact,
  message: { id: string; subject: string },
  newMessageCount: number
) {
  const isCreator = seq.outreachType === "CREATOR";
  // The influencer cadence exists to get a rate. Once there is one, the thread is a human
  // negotiation and the team writing back is part of it — not the start of a new cadence. Treating
  // it as one sent canned "just checking in on my last message" nudges to creators who had already
  // named their price and been answered by hand, which reads as never having opened their email.
  const rateOnFile = isCreator && seq.quotedRateAt !== null;

  const claimed = await claimSequence(seq, {
    ...(rateOnFile
      ? // They replied with a rate and the team has now answered: that is the whole state.
        { status: "REPLIED" }
      : {
          status: "WAITING_FOR_REPLY",
          currentStep: 0,
          // A fresh round of nudges starting means we're waiting on a new response — don't carry
          // over the "Response Received" marker from whatever round came before this one.
          creatorListResponseAt: null,
        }),
    lastKnownMsgCount: newMessageCount,
    // The team just wrote back, so any reply that was waiting on them has been answered.
    awaitingResponseSince: null,
  });
  if (!claimed) return; // another concurrent check already picked up this same message

  const recordManualSend = prisma.emailMessage.create({
    data: {
      sequenceId: seq.id,
      providerMessageId: message.id,
      direction: "OUT" as const,
      source: "MANUAL" as const,
      subject: message.subject,
      body: "(sent directly from Gmail — not tracked by the system)",
      sentAt: new Date(),
      status: "SENT" as const,
    },
  });
  const cancelPending = prisma.scheduledAction.updateMany({
    where: { sequenceId: seq.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  if (rateOnFile) {
    await prisma.$transaction([
      recordManualSend,
      cancelPending,
      prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "MANUAL_MESSAGE_DETECTED",
          description:
            "Spotted a message you sent directly from Gmail. They've already shared their rate, so this one stays with you — no automatic check-ins.",
        },
      }),
    ]);
    return;
  }

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const scheduledAt = computeNextScheduledAt(seq.outreachType, 1, settings);
  // An influencer thread has no creator list: the team writing to a creator is brand details or a
  // counter-offer, so the stage stays where the reply reader put it and the nudge is a check-in.
  const stageChanges = !isCreator && !MANUAL_OR_TERMINAL_STAGES.includes(seq.stage) && seq.stage !== "CREATOR_LIST_SENT";

  await prisma.$transaction([
    recordManualSend,
    cancelPending,
    ...(stageChanges
      ? [prisma.outreachSequence.update({ where: { id: seq.id }, data: { stage: "CREATOR_LIST_SENT" as const } })]
      : []),
    prisma.scheduledAction.create({
      data: {
        sequenceId: seq.id,
        step: 1,
        scheduledAt,
        status: "PENDING",
        kind: isCreator ? "CREATOR_NUDGE" : "CREATOR_LIST_NUDGE",
        actionKey: `${seq.id}-manual-${message.id}`,
      },
    }),
    prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: "MANUAL_MESSAGE_DETECTED",
        description: isCreator
          ? `Spotted a message you sent directly from Gmail — restarted the reply timer. If they don't answer, we'll check in on ${formatDateTime(scheduledAt)}.`
          : `Spotted a message you sent directly from Gmail — restarted the reply timer. We'll nudge about the creator list if there's no reply by ${formatDateTime(scheduledAt)}.`,
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

// Influencer stages only ever move forward on their own: a "sounds good" after a quoted rate must
// not knock the creator back from Rate Received to Interested.
const CREATOR_STAGE_ORDER: string[] = ["FIRST_EMAIL_SENT", "INTERESTED", "RATE_RECEIVED", "NEGOTIATION", "CREATOR_SELECTED", "DEAL"];
const CREATOR_STAGE_NAME: Record<PipelineStage, string> = {
  FIRST_EMAIL_SENT: "First Email Sent",
  CREATOR_LIST_REQUESTED: "Creator List Requested",
  CREATOR_LIST_SENT: "Creator List Sent",
  NEGOTIATION: "Negotiation",
  CREATOR_SELECTED: "Creator Selected",
  NOT_INTERESTED: "Not Interested",
  DEAL: "Deal",
  INTERESTED: "Interested",
  RATE_RECEIVED: "Rate Received",
};

function creatorStageAfter(current: string, reached: PipelineStage): PipelineStage {
  const from = CREATOR_STAGE_ORDER.indexOf(current);
  const to = CREATOR_STAGE_ORDER.indexOf(reached);
  return (from === -1 || to > from ? reached : current) as PipelineStage;
}

/** The reply's own Date header — falls back to now for a missing or nonsensical one. */
function replyDate(raw: string): Date {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 60_000 ? new Date() : parsed;
}

/**
 * Set while reading a thread the automation had already wrapped up (see DORMANT_WHERE): when the
 * team last touched it by hand, so a reply they've already acted on isn't flagged again.
 */
type LateReplyContext = { teamActedAt: Date | null };

function handledAfter(late: LateReplyContext | null, rawReplyDate: string): boolean {
  return !!late?.teamActedAt && late.teamActedAt.getTime() > replyDate(rawReplyDate).getTime();
}

/**
 * The stage a wrapped-up thread goes back to when the other side writes again — what it was before
 * running out of follow-ups turned it into Not Interested.
 */
async function stageBeforeSilence(seq: SequenceWithContact): Promise<PipelineStage> {
  if (seq.outreachType === "CREATOR") {
    if (seq.quotedRateAt) return "RATE_RECEIVED";
    return seq.lastReplyAt ? "INTERESTED" : "FIRST_EMAIL_SENT";
  }
  const wroteByHand = await prisma.emailMessage.count({ where: { sequenceId: seq.id, direction: "OUT", source: "MANUAL" } });
  return wroteByHand > 0 ? "CREATOR_LIST_SENT" : "FIRST_EMAIL_SENT";
}

/**
 * Acts on an influencer's reply, read by lib/creatorReplyAI.ts. Anything the team has to answer —
 * a rate, interest, a question — stops the follow-ups and sets awaitingResponseSince, which is the
 * highlight on the Influencer Outreach page. A decline or opt-out stops them without the highlight;
 * "I'll get back to you" swaps the cadence for a single later check-in.
 */
async function handleCreatorReply(
  seq: SequenceWithContact,
  replies: { from: string; date: string }[],
  text: string,
  analysis: CreatorReplyAnalysis,
  watermark: number,
  late: LateReplyContext | null = null
): Promise<ThreadCheckResult> {
  const latest = replies[replies.length - 1];
  const from = latest.from;
  // A late reply the team already dealt with by hand (set the stage, typed in the rate) shouldn't
  // come back as "needs your reply" — they've seen it.
  const alreadyHandled = handledAfter(late, latest.date);
  const common = {
    lastKnownMsgCount: watermark,
    lastReplyAt: replyDate(latest.date),
    lastReplyText: text.slice(0, 4000) || null,
    replyIntent: analysis.intent,
    replySummary: analysis.summary,
    ...(seq.lastReplyAt ? {} : { repliedAfterStep: seq.currentStep }),
  };
  const notClaimed: ThreadCheckResult = { terminal: false, manualSendDetected: false };
  const contactEmail = seq.contact.email.toLowerCase();
  const replyAddress = emailAddressOf(latest.from);
  const otherAddresses = findEmailAddresses(text).filter((address) => address !== contactEmail && address !== replyAddress);
  const redirectNote =
    (replyAddress && replyAddress !== contactEmail ? ` They wrote from ${replyAddress}, not ${contactEmail} — reply to that address.` : "") +
    (otherAddresses.length > 0 ? ` They mention ${otherAddresses.slice(0, 2).join(" and ")} — possibly a manager to reply to instead.` : "");
  const cancelPending = () =>
    prisma.scheduledAction.updateMany({ where: { sequenceId: seq.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  const stageLog = (stage: PipelineStage) =>
    stage === seq.stage
      ? []
      : [
          prisma.activityLog.create({
            data: { sequenceId: seq.id, eventType: "STAGE_CHANGED", description: `Stage set to ${CREATOR_STAGE_NAME[stage] ?? stage}.` },
          }),
        ];

  // Anyone who writes back (short of opting out) is worth a media kit on file for future brand
  // pitches, and a quoted rate belongs on their roster row. Neither may break reply handling.
  const updateCreatorProfile = async (rateShared: boolean) => {
    try {
      if (rateShared) await syncCreatorRateFromSequence(seq.id);
      await requestCreatorMediaKit(seq.id);
    } catch (err) {
      console.error(`[creator reply] couldn't update the creator profile for sequence ${seq.id}:`, err);
    }
  };

  if (analysis.intent === "OPT_OUT") {
    if (!(await claimSequence(seq, { ...common, status: "UNSUBSCRIBED", stage: "NOT_INTERESTED", awaitingResponseSince: null }))) {
      return notClaimed;
    }
    await prisma.$transaction([
      prisma.suppressedContact.upsert({
        where: { email: contactEmail },
        update: {},
        create: { email: contactEmail, reason: "Replied asking not to be contacted" },
      }),
      cancelPending(),
      prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "UNSUBSCRIBE_DETECTED",
          description: `${from} asked not to be contacted again — added to the Do Not Email list.`,
        },
      }),
      ...stageLog("NOT_INTERESTED"),
    ]);
    return { terminal: true, status: "UNSUBSCRIBED" };
  }

  if (analysis.intent === "UNINTERESTED") {
    if (!(await claimSequence(seq, { ...common, status: "REPLIED", stage: "NOT_INTERESTED", awaitingResponseSince: null }))) {
      return notClaimed;
    }
    await prisma.$transaction([
      cancelPending(),
      prisma.activityLog.create({
        data: { sequenceId: seq.id, eventType: "REPLY_DETECTED", description: `${from} declined the collaboration — follow-ups stopped.${redirectNote}` },
      }),
      ...stageLog("NOT_INTERESTED"),
    ]);
    await updateCreatorProfile(false);
    return { terminal: true, status: "REPLIED" };
  }

  if (analysis.intent === "NON_COMMITTAL") {
    if (!(await claimSequence(seq, { ...common, status: "WAITING_FOR_REPLY", currentStep: 0, awaitingResponseSince: null }))) {
      return notClaimed;
    }
    const settings = await prisma.automationSettings.findFirstOrThrow();
    const scheduledAt = pickRandomSendTime(addBusinessDays(new Date(), settings.nonCommittalDelayDays), sendingWindowFor("CREATOR", settings));
    await prisma.$transaction([
      cancelPending(),
      prisma.scheduledAction.create({
        data: {
          sequenceId: seq.id,
          step: 1,
          scheduledAt,
          status: "PENDING",
          kind: "CREATOR_NUDGE",
          actionKey: `${seq.id}-creator-noncommittal-${Date.now()}`,
        },
      }),
      prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "GENERIC_REPLY_DETECTED",
          description: `${from} said they'll get back to you — we'll check in on ${formatDateTime(scheduledAt)} if they don't.${redirectNote}`,
        },
      }),
    ]);
    await updateCreatorProfile(false);
    return { terminal: false, manualSendDetected: false, rescheduled: true };
  }

  // RATE_SHARED, INTERESTED, or any other reply a person should read: stop following up and put it
  // in front of the team.
  const stage =
    analysis.intent === "RATE_SHARED"
      ? creatorStageAfter(seq.stage, "RATE_RECEIVED")
      : analysis.intent === "INTERESTED"
        ? creatorStageAfter(seq.stage, "INTERESTED")
        : (seq.stage as PipelineStage);

  let rateData = {};
  if (analysis.intent === "RATE_SHARED") {
    const stored = parseStoredRates(seq.quotedRates);
    // Re-reading an older reply must not overwrite a price the team entered by hand since.
    const incoming = late
      ? analysis.rates.filter((r) => !stored.some((s) => s.source === "manual" && (s.deliverable ?? null) === (r.deliverable ?? null)))
      : analysis.rates;
    const rates = mergeRates(stored, incoming);
    const primary = primaryRate(rates);
    rateData = {
      quotedRates: rates,
      quotedRateAmount: primary?.amount ?? null,
      quotedRateCurrency: primary?.currency ?? null,
      quotedRateAt: new Date(),
      rateNote: analysis.rates.length > 0 ? null : analysis.rateNote,
    };
  }

  if (
    !(await claimSequence(seq, {
      ...common,
      status: "REPLIED",
      stage,
      awaitingResponseSince: alreadyHandled ? null : new Date(),
      ...rateData,
    }))
  ) {
    return notClaimed;
  }

  const description =
    (analysis.intent === "RATE_SHARED"
      ? analysis.rates.length > 0
        ? `${from} shared their rate: ${analysis.rates.map((rate) => formatRate(rate)).join(", ")}. Follow-ups stopped — reply to move it forward.`
        : `${from} shared a rate card or media kit — open the email to see their pricing. Follow-ups stopped.`
      : analysis.intent === "INTERESTED"
        ? `${from} is interested but hasn't given a rate yet — follow-ups stopped. Reply with what they asked for.`
        : `${from} replied — follow-ups stopped. Have a look and reply.`) +
    (alreadyHandled ? " You'd already updated this one by hand, so it isn't flagged as waiting on you." : "");

  await prisma.$transaction([
    cancelPending(),
    prisma.activityLog.create({
      data: {
        sequenceId: seq.id,
        eventType: analysis.intent === "RATE_SHARED" ? "RATE_DETECTED" : "REPLY_DETECTED",
        description: description + redirectNote,
      },
    }),
    ...stageLog(stage),
  ]);
  await updateCreatorProfile(analysis.intent === "RATE_SHARED" && analysis.rates.length > 0);
  return { terminal: true, status: "REPLIED" };
}

/**
 * A reply that doesn't move things forward ("ok, will check and get back to you") still restarts
 * the reply-timer — just with nudge copy that asks whether they've had a chance to check
 * internally, and a shorter, configurable delay, instead of silently reusing whatever cadence was
 * already in flight.
 */
async function handleNonCommittalReply(
  seq: SequenceWithContact,
  from: string,
  newMessageCount: number,
  replyFields: Record<string, unknown> = {}
) {
  const creatorListAlreadySent = !PRE_LIST_STAGES.includes(seq.stage);
  const claimed = await claimSequence(seq, {
    ...replyFields,
    status: "WAITING_FOR_REPLY",
    currentStep: 0,
    awaitingResponseSince: null,
    lastKnownMsgCount: newMessageCount,
    ...(creatorListAlreadySent ? { creatorListResponseAt: new Date() } : {}),
  });
  if (!claimed) return;

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const scheduledAt = pickRandomSendTime(
    addBusinessDays(new Date(), settings.nonCommittalDelayDays),
    sendingWindowFor(seq.outreachType, settings)
  );

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
export async function checkThreadForTerminalEvent(
  gmail: gmail_v1.Gmail,
  seq: SequenceWithContact,
  options: { dormant?: boolean } = {}
): Promise<ThreadCheckResult> {
  const thread = await getThreadSummary(gmail, seq.threadId);
  const newMessages = thread.messages.slice(seq.lastKnownMsgCount);
  if (newMessages.length === 0) return { terminal: false, manualSendDetected: false };

  const recorded = await prisma.emailMessage.findMany({
    where: { sequenceId: seq.id },
    select: { providerMessageId: true, direction: true, body: true },
  });
  const knownIds = new Set(recorded.map((m) => m.providerMessageId));

  let sawOnlyAutoReplies = false;
  let msgCountSoFar = seq.lastKnownMsgCount;
  // A message is ours only when it comes from one of the team's connected inboxes (or a teammate on
  // the company's own domain). Anything else is the other side replying — including from a different
  // address than the one emailed: a creator's manager or agency, a brand colleague. This used to
  // require the exact contact address, so such replies (and mailer-daemon bounces) were mistaken for
  // a message the team had typed in Gmail, and the reply never showed.
  const isOurs = ownSenderMatcher((await prisma.emailAccount.findMany({ select: { email: true } })).map((a) => a.email));
  // Read-tracking notices (Mailsuite's "your email hasn't been opened yet", Mailtrack pings) thread
  // into the conversation but are neither side talking. Read as the contact, one used to overwrite
  // a creator's real reply with "Reminder ⚠️ Your email to … has not been opened yet", flag them as
  // needing an answer again, and could count as a reply from someone who never wrote back.
  const isTrackingPing = (msg: { from: string }) => isTrackingNotification(emailAddressOf(msg.from));
  const isFromContact = (msg: { from: string }) => !isOurs(msg.from) && !isTrackingPing(msg);

  // A thread that had wrapped up with no reply just got a real message — someone answering late, or
  // the team writing again by hand. Put the stage back to what it was before silence turned it into
  // Not Interested, then read the message exactly as if the thread had never stopped.
  let late: LateReplyContext | null = null;
  if (options.dormant) {
    const actionable = newMessages.some((m) => !isTrackingPing(m) && (isFromContact(m) ? !looksLikeAutoReply(m) : !knownIds.has(m.id)));
    if (actionable) {
      const lastTeamAction = await prisma.activityLog.findFirst({
        where: { sequenceId: seq.id, eventType: { in: ["STAGE_CHANGED", "RATE_DETECTED", "REPLY_HANDLED"] } },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      });
      late = { teamActedAt: lastTeamAction?.timestamp ?? null };
      const revived = seq.stage === "NOT_INTERESTED" ? await stageBeforeSilence(seq) : (seq.stage as PipelineStage);
      await prisma.$transaction([
        prisma.outreachSequence.update({ where: { id: seq.id }, data: { stage: revived } }),
        prisma.activityLog.create({
          data: {
            sequenceId: seq.id,
            eventType: "REPLY_CHECK_PERFORMED",
            description:
              revived !== seq.stage
                ? `New message on a thread that had wrapped up with no reply — moved it back to ${CREATOR_STAGE_NAME[revived]} and reading it now.`
                : "New message on a thread that had wrapped up with no reply — reading it now.",
          },
        }),
      ]);
      seq = { ...seq, stage: revived };
    }
  }
  const creatorListAlreadySent = !PRE_LIST_STAGES.includes(seq.stage);

  // What a brand wrote, recorded the same way the influencer reader records a creator's reply, so the
  // Brand Outreach page can show who answered and what they said without opening every thread.
  async function brandReplyFields(m: { id: string; date: string; snippet: string }, intent: string, needsAnswer: boolean) {
    return {
      lastReplyAt: replyDate(m.date),
      lastReplyText: (await bodyOf(m)).slice(0, 4000) || null,
      replyIntent: intent,
      ...(seq.lastReplyAt ? {} : { repliedAfterStep: seq.currentStep }),
      awaitingResponseSince: needsAnswer && !handledAfter(late, m.date) ? new Date() : null,
    };
  }

  // Full message bodies are fetched only when an influencer thread has a real reply to read. The
  // snippet is ~200 characters — exactly where a rate at the end of a friendly reply gets cut off.
  let bodies: Map<string, string> | undefined;
  async function bodyOf(msg: { id: string; snippet: string }): Promise<string> {
    if (!bodies) {
      try {
        bodies = new Map((await getThreadFullText(gmail, seq.threadId)).map((t) => [t.id, t.text]));
      } catch (err) {
        console.error(`[reply check] couldn't read the full thread for sequence ${seq.id}:`, err);
        bodies = new Map();
      }
    }
    return bodies.get(msg.id)?.trim() || msg.snippet;
  }

  for (const [index, m] of newMessages.entries()) {
    msgCountSoFar++;
    if (isTrackingPing(m)) {
      // Nothing to act on — just make sure the watermark moves past it (see sawOnlyAutoReplies).
      sawOnlyAutoReplies = true;
      continue;
    }
    const fromContact = isFromContact(m);

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

    if (seq.outreachType === "CREATOR") {
      // Consecutive replies up to the team's own next message are read as one answer, so a quick
      // "Hi!" followed by "my rate is $900" doesn't leave the rate unread behind the greeting.
      // Stopping at the team's message leaves it for the next pass, which restarts the reply timer.
      const batch: typeof newMessages = [];
      let end = index;
      while (end < newMessages.length) {
        const next = newMessages[end];
        if (isTrackingPing(next)) {
          end++;
          continue;
        }
        const nextFromContact = isFromContact(next);
        if (!nextFromContact && !knownIds.has(next.id)) break;
        if (nextFromContact && looksLikeBounce(next)) break;
        if (nextFromContact && !looksLikeAutoReply(next)) batch.push(next);
        end++;
      }
      const texts: string[] = [];
      for (const reply of batch) texts.push(await bodyOf(reply));
      const text = texts.join("\n\n");
      const analysis = await analyzeCreatorReply(text, {
        sentBodies: recorded.filter((r) => r.direction === "OUT").map((r) => r.body),
      });
      if (analysis.intent === "AUTO_REPLY") {
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
      return handleCreatorReply(seq, batch, text, analysis, seq.lastKnownMsgCount + end, late);
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
      await handleNonCommittalReply(seq, m.from, thread.messages.length, await brandReplyFields(m, classification, false));
      return { terminal: false, manualSendDetected: false, rescheduled: true };
    }

    if (classification === "WANTS_CREATOR_LIST") {
      const claimed = await claimSequence(seq, {
        ...(await brandReplyFields(m, classification, true)),
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
        ...(await brandReplyFields(m, classification, true)),
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
        ...(await brandReplyFields(m, classification, false)),
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
        ...(await brandReplyFields(m, classification, false)),
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
        ...(await brandReplyFields(m, "HUMAN_REPLY", true)),
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
    where: { status: { notIn: DEAD_STATUSES }, stage: { notIn: DEAD_STAGES }, deletedAt: null },
    include: { contact: true, emailAccount: true },
    // Least-recently-checked first (never-checked sorts first). This pass is time-bounded, so a
    // fixed order would mean everything past the cutoff never got checked at all once there are
    // more active sequences than fit in one pass — the tail would go permanently unwatched.
    orderBy: { lastReplyCheckAt: { sort: "asc", nulls: "first" } },
  });
  // Bounded so a growing number of active threads (or a slow Gmail API) can never eat the whole
  // tick — anything left unchecked this pass just gets picked up on the next one. Reply detection
  // tolerates that; a scheduled send does not, which is why runWorkerTick runs the due-send passes
  // before this one and this one is the one with a cap.
  return checkSequences(activeSequences, REPLY_CHECK_TIME_BUDGET_MS, false);
}

/**
 * The slow sweep over threads that wrapped up with no reply (DORMANT_WHERE). A handful per pass,
 * least-recently-checked first, so every one of them is looked at again every few hours without
 * taking time from the threads still in play. `onlyIds` narrows it to threads the inbox sync just
 * saw change, which is what catches a late reply within minutes rather than hours.
 */
export async function runDormantReplyCheck(onlyIds?: string[]) {
  if (onlyIds && onlyIds.length === 0) return [];
  const sequences = await prisma.outreachSequence.findMany({
    where: {
      AND: [DORMANT_WHERE, { emailAccount: { accessStatus: "CONNECTED" } }, ...(onlyIds ? [{ id: { in: onlyIds } }] : [])],
    },
    include: { contact: true, emailAccount: true },
    orderBy: { lastReplyCheckAt: { sort: "asc", nulls: "first" } },
    take: DORMANT_CHECK_BATCH,
  });
  return checkSequences(sequences, DORMANT_CHECK_TIME_BUDGET_MS, true);
}

async function checkSequences(
  sequences: (SequenceWithContact & { emailAccount: { accessStatus: string } })[],
  budgetMs: number,
  dormant: boolean
) {
  const results = [];
  const startedAt = Date.now();
  for (const seq of sequences) {
    if (Date.now() - startedAt > budgetMs) break;
    if (seq.emailAccount.accessStatus !== "CONNECTED") continue;
    try {
      // Stamped before the check, not after, so a sequence whose check throws every time still
      // rotates to the back of the queue instead of blocking everything behind it forever.
      await prisma.outreachSequence.update({
        where: { id: seq.id },
        data: { lastReplyCheckAt: new Date() },
      });
      const gmail = await gmailClientFor(seq.emailAccountId);
      const result = await checkThreadForTerminalEvent(gmail, seq, { dormant });
      if (result.terminal) results.push({ sequenceId: seq.id, event: result.status });
      else if (result.manualSendDetected) results.push({ sequenceId: seq.id, event: "MANUAL_MESSAGE_DETECTED" });
    } catch (err) {
      console.error(`[${dormant ? "late" : "continuous"} reply check] failed for sequence ${seq.id}:`, err);
    }
  }
  return results;
}

const NUDGE_KINDS = new Set<string>(["CREATOR_LIST_NUDGE", "TEAM_CHECK_NUDGE", "GENERIC_NUDGE", "CREATOR_NUDGE"]);

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
  // Claim before touching Gmail so overlapping ticks (or a tick racing the dashboard's "Send It
  // Now" button) can't both send this one.
  if (!(await claimScheduledAction(scheduledActionId))) {
    return { skipped: true, reason: "Already being processed" };
  }
  try {
    return await processScheduledActionClaimed(scheduledActionId, options);
  } finally {
    await releaseScheduledActionClaim(scheduledActionId);
  }
}

async function processScheduledActionClaimed(
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
  if (seq.deletedAt) return { skipped: true, reason: "Sequence is in Trash" };
  if (seq.status === "PAUSED") return { skipped: true, reason: "Sequence paused" };
  if (
    ["REPLIED", "BOUNCED", "UNSUBSCRIBED", "STOPPED", "COMPLETED"].includes(seq.status)
  ) {
    return { skipped: true, reason: `Sequence is ${seq.status}` };
  }

  // An influencer who has named a price is in a human negotiation, so nothing automatic goes into
  // that thread again — including a nudge that was already queued when the rate arrived.
  if (seq.outreachType === "CREATOR" && seq.quotedRateAt) {
    await prisma.$transaction([
      prisma.scheduledAction.update({ where: { id: action.id }, data: { status: "CANCELLED" } }),
      prisma.activityLog.create({
        data: {
          sequenceId: seq.id,
          eventType: "FOLLOW_UP_CANCELLED",
          description: "Dropped a queued check-in — they've already shared their rate, so this thread is yours to reply to.",
        },
      }),
    ]);
    return { skipped: true, reason: "Rate already received" };
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
  if (checkResult.rescheduled) {
    // The reply just replaced this follow-up with a later check-in; sending it now would chase
    // someone minutes after they wrote back.
    return { skipped: true, reason: "Reply received; check-in rescheduled" };
  }

  await prisma.activityLog.create({
    data: { sequenceId: seq.id, eventType: "NO_REPLY_FOUND", description: "No reply yet." },
  });

  // --- Sending window check ---
  const settings = await prisma.automationSettings.findFirstOrThrow();
  const now = new Date();
  const sendWindow = sendingWindowFor(seq.outreachType, settings);
  const clamped = clampToSendingWindow(now, sendWindow);
  // A time a human picked by hand is a decision, not a suggestion — the window exists to keep the
  // *automatic* cadence inside business hours, so it must not quietly move an explicitly chosen
  // send to some other time.
  if (!options.ignoreSendingWindow && !action.manuallyScheduled && clamped.getTime() > now.getTime() + 60_000) {
    // Outside the window right now; push this action to the next valid moment and retry later.
    await prisma.scheduledAction.update({ where: { id: action.id }, data: { scheduledAt: clamped } });
    return { skipped: true, reason: "Outside sending window; rescheduled" };
  }

  // --- Daily sending-quota protection (avoid tripping Gmail's spam/quota flags) ---
  const underLimit = await isUnderDailyLimit(seq.emailAccountId, seq.emailAccount.dailySendLimit);
  if (!underLimit) {
    const tomorrow = clampToSendingWindow(addCalendarDays(new Date(), 1), sendWindow);
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
        // Silence through every follow-up reads as "not interested" for the pipeline view too —
        // see stageAfterSilence for the cases that keep their stage.
        ...(next.status === "COMPLETED" && stageAfterSilence(seq) ? { stage: "NOT_INTERESTED" as const } : {}),
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

// Reply-checking is best-effort and runs after the send passes (see runWorkerTick) specifically
// so it can never starve a due send — a reply noticed a minute late is a non-event; a promised
// email that silently never goes out is not. Bounded so it always leaves headroom under the
// tick route's 60s Vercel ceiling.
const REPLY_CHECK_TIME_BUDGET_MS = 20_000;

// The wrapped-up-thread sweep is deliberately small: most of these never get another message, and
// the inbox sync catches the ones that do much sooner (see runWorkerTick).
const DORMANT_CHECK_BATCH = 10;
const DORMANT_CHECK_TIME_BUDGET_MS = 6_000;

/** How long a tick can hold a row before another tick assumes it died mid-send and takes over. */
const CLAIM_STALE_MS = 5 * 60 * 1000;

// Cadence for the two Gmail-heavy passes, independent of how often the tick itself runs. Stamped
// before the pass starts, which doubles as a cheap mutex so overlapping ticks don't both run it.
const REPLY_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const INBOX_SCAN_INTERVAL_MS = 2 * 60 * 1000;

// Enrichment only starts if the tick is still young, and stops well before the route's 60s limit.
const ENRICHMENT_START_CUTOFF_MS = 25_000;
const ENRICHMENT_BUDGET_MS = 20_000;
const TICK_SOFT_LIMIT_MS = 45_000;

/** Single-row table holding the worker's cross-tick state (last-run stamps, send spacing). */
async function getWorkerState() {
  const existing = await prisma.workerHeartbeat.findFirst();
  return existing ?? prisma.workerHeartbeat.create({ data: { lastRunAt: new Date() } });
}

/**
 * Anti-burst spacing that doesn't block. The old approach slept between sends inside the tick,
 * which stops working once ticks are short and frequent — and sleeping in a serverless function
 * is billed wall-clock time spent doing nothing. Instead each send pushes a "next send allowed"
 * stamp forward by the configured random gap, and every tick simply declines to send before it.
 * Same human-looking spacing, no blocking, and it holds across ticks and concurrent runs.
 */
async function sendingAllowedNow(): Promise<boolean> {
  const state = await getWorkerState();
  return !state.nextSendAllowedAt || state.nextSendAllowedAt.getTime() <= Date.now();
}

async function spaceOutNextSend(settings: AutomationSettings) {
  const min = settings.sendSpacingSecondsMin;
  const max = Math.max(min, settings.sendSpacingSecondsMax);
  const gapMs = (min + Math.random() * (max - min)) * 1000;
  const state = await getWorkerState();
  await prisma.workerHeartbeat.update({
    where: { id: state.id },
    data: { nextSendAllowedAt: new Date(Date.now() + gapMs) },
  });
}

/**
 * Takes exclusive ownership of a pending row before any Gmail work happens. Ticks overlap now
 * (the worker loops every ~30s and a finishing run can briefly overlap a starting one), so a
 * plain read-then-send would let two ticks both see PENDING and send the same email twice. A
 * claim older than CLAIM_STALE_MS is treated as abandoned, so a tick killed mid-send by the
 * platform's function timeout can't strand a row as permanently unsendable.
 */
async function claimScheduledAction(id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
  const result = await prisma.scheduledAction.updateMany({
    where: { id, status: "PENDING", OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }] },
    data: { claimedAt: new Date() },
  });
  return result.count === 1;
}

/** Hands a still-pending row back so the next tick can retry it. A row that actually sent is no
 * longer PENDING, so this leaves it alone. */
async function releaseScheduledActionClaim(id: string) {
  await prisma.scheduledAction.updateMany({ where: { id, status: "PENDING" }, data: { claimedAt: null } });
}

// How many due rows a single pass will look at. It only ever *sends* one (the spacing gate stops
// it after that), but it walks a few so a row that skips for its own reasons — suppressed
// recipient, paused sequence — can't sit at the head of the queue blocking everything behind it.
const SEND_SCAN_DEPTH = 5;

/**
 * Sends the single most-overdue follow-up that's ready to go, if the spacing gate allows one
 * right now. One per tick rather than a whole batch: ticks run every ~30s, so a backlog still
 * drains quickly, and each send naturally lands a randomized gap after the last one without the
 * pass ever blocking. Anything not sent this tick is still due and gets picked up by the next.
 */
export async function runDueScheduledActions() {
  if (!(await sendingAllowedNow())) return [];

  const due = await prisma.scheduledAction.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() }, sequence: { deletedAt: null } },
    orderBy: { scheduledAt: "asc" },
    take: SEND_SCAN_DEPTH,
  });
  if (due.length === 0) return [];

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const results = [];

  for (const action of due) {
    let result: Awaited<ReturnType<typeof processScheduledAction>>;
    try {
      result = await processScheduledAction(action.id);
    } catch (err) {
      // One failing send (e.g. an inbox whose Gmail access just expired — now marked for
      // reconnecting) must not fail the whole tick and hold up every other due email behind it.
      console.error(`[send pass] follow-up ${action.id} failed:`, err);
      results.push({ actionId: action.id, skipped: true, reason: err instanceof Error ? err.message : "Failed" });
      continue;
    }
    results.push({ actionId: action.id, ...result });
    if ("sent" in result && result.sent) {
      await spaceOutNextSend(settings);
      break;
    }
  }
  return results;
}

/**
 * Same, for "Write & Send" emails scheduled for a future time (like Gmail's own "Schedule send").
 * Shares the one spacing gate with the follow-up pass above, so a tick sends at most one email
 * total across both — whichever is most overdue gets its turn first.
 */
export async function runDueInitialEmails() {
  if (!(await sendingAllowedNow())) return [];

  const due = await prisma.scheduledInitialEmail.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: SEND_SCAN_DEPTH,
  });
  if (due.length === 0) return [];

  const settings = await prisma.automationSettings.findFirstOrThrow();
  const results = [];

  for (const scheduled of due) {
    let result: Awaited<ReturnType<typeof processScheduledInitialEmail>>;
    try {
      result = await processScheduledInitialEmail(scheduled.id);
    } catch (err) {
      console.error(`[send pass] scheduled email ${scheduled.id} failed:`, err);
      results.push({ scheduledId: scheduled.id, skipped: true, reason: err instanceof Error ? err.message : "Failed" });
      continue;
    }
    results.push({ scheduledId: scheduled.id, ...result });
    if ("sent" in result && result.sent) {
      await spaceOutNextSend(settings);
      break;
    }
  }
  return results;
}

/**
 * The full worker tick: send whatever's actually due first — scheduled Email 1s, then follow-ups
 * — then spend whatever's left of the time budget checking active sequences for replies/manual-
 * sends, and finally scan each connected inbox for new mail that isn't part of any tracked thread
 * at all (a brand-new contact, or a reply on something never attached to the CRM). Due sends go
 * first on purpose: they're a promise to the team about when something goes out, while both kinds
 * of inbox-checking are inherently a poll that's fine to pick back up next tick. This is what
 * scripts/worker.ts calls on each poll.
 */
export async function runWorkerTick() {
  const tickStartedAt = Date.now();
  const initialEmailResults = await runDueInitialEmails();
  const actionResults = await runDueScheduledActions();

  // The two Gmail-heavy passes run on their own slower cadence. The tick itself fires every ~30s
  // so a due send lands close to its scheduled minute, but polling every thread and every inbox
  // that often would burn Gmail API quota for no benefit — a reply or a new message noticed a
  // minute or two later costs nothing, a send two minutes late is the bug this all exists to fix.
  const state = await getWorkerState();
  const now = Date.now();

  // At most one heavy pass per tick. Both are Gmail-bound and each can take tens of seconds on a
  // busy account; running them in the same invocation stacks their cost toward the tick route's
  // 60s ceiling for no reason. Whichever one loses just runs on the next tick, 30s later.
  let heavyPassRan = false;

  let replyResults: Awaited<ReturnType<typeof runContinuousReplyCheck>> = [];
  if (!state.lastReplyCheckAt || now - state.lastReplyCheckAt.getTime() >= REPLY_CHECK_INTERVAL_MS) {
    await prisma.workerHeartbeat.update({ where: { id: state.id }, data: { lastReplyCheckAt: new Date() } });
    replyResults = await runContinuousReplyCheck();
    replyResults.push(...(await runDormantReplyCheck()));
    heavyPassRan = true;
  }

  let newMailFound = 0;
  if (!heavyPassRan && (!state.lastInboxScanAt || now - state.lastInboxScanAt.getTime() >= INBOX_SCAN_INTERVAL_MS)) {
    await prisma.workerHeartbeat.update({ where: { id: state.id }, data: { lastInboxScanAt: new Date() } });
    try {
      const synced = await syncInbox();
      newMailFound = synced.threadsSynced;
      if (synced.sequenceIds.length > 0) {
        // Something happened on these tracked threads: check them first on the next reply pass, and
        // read any that had already wrapped up right now — that's the late reply the regular check
        // would otherwise never see.
        await prisma.outreachSequence.updateMany({ where: { id: { in: synced.sequenceIds } }, data: { lastReplyCheckAt: null } });
        replyResults.push(...(await runDormantReplyCheck(synced.sequenceIds)));
      }
    } catch (err) {
      // Same principle as the per-sequence try/catch inside runContinuousReplyCheck — a failure
      // scanning for new mail must never take down the rest of the tick (the due-sends above
      // already happened and shouldn't be reported as a failed tick because of this).
      console.error("[inbox watch] tick failed:", err);
    }
  }

  // Creator enrichment (email lookups, queued media kits) gets whatever time is left, last — it's
  // background housekeeping and must never delay a send. Loaded lazily: it pulls in the YouTube
  // client, which nothing else in a tick needs.
  let enrichment: { mediaKits: number; emailLookups: number; emailsFound: number } | null = null;
  const elapsed = Date.now() - tickStartedAt;
  if (elapsed < ENRICHMENT_START_CUTOFF_MS) {
    try {
      const { runCreatorEnrichmentPass } = await import("@/lib/creatorEnrichment");
      enrichment = await runCreatorEnrichmentPass(Math.min(ENRICHMENT_BUDGET_MS, TICK_SOFT_LIMIT_MS - elapsed));
    } catch (err) {
      console.error("[creator enrichment] pass failed:", err);
    }
  }

  return {
    enrichment,
    repliesFound: replyResults.length,
    initialEmailsSent: initialEmailResults.length,
    actionsProcessed: actionResults.length,
    newMailFound,
    replyResults,
    initialEmailResults,
    actionResults,
  };
}

export { MAX_FOLLOW_UPS };
