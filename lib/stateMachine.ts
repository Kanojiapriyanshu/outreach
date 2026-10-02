export type SequenceStatus =
  | "NEW"
  | "INITIAL_EMAIL_DETECTED"
  | "WAITING_FOR_REPLY"
  | "FOLLOW_UP_1_SENT"
  | "FOLLOW_UP_2_SENT"
  | "FOLLOW_UP_3_SENT"
  | "FOLLOW_UP_4_SENT"
  | "REPLIED"
  | "BOUNCED"
  | "UNSUBSCRIBED"
  | "STOPPED"
  | "PAUSED"
  | "COMPLETED";

export type SequenceEvent =
  | "REPLY"
  | "BOUNCE"
  | "UNSUBSCRIBE"
  | "STOP"
  | "PAUSE"
  | "RESUME"
  | "NO_REPLY_ADVANCE"; // no reply found; the caller has just sent (or is about to send) the next follow-up

export const FINAL_STATUSES: SequenceStatus[] = [
  "REPLIED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "STOPPED",
  "COMPLETED",
];

export const MAX_FOLLOW_UPS = 3;

// Manual stage overrides the team sets themselves on the dashboard — a message arriving in the
// thread should never bump the sequence backwards out of one of these into CREATOR_LIST_SENT.
export const MANUAL_OR_TERMINAL_STAGES = ["NEGOTIATION", "CREATOR_SELECTED", "DEAL", "NOT_INTERESTED"];

/**
 * Where a sequence's pipeline stage lands when every follow-up went out with no answer. Silence
 * reads as Not Interested — except where the team already made a call on it, or an influencer had
 * already written back (quoted a rate, or said they're interested). Their last answer is still the
 * true state; burying it under Not Interested is how creators who had replied went missing from
 * the Interested and Rate Received lists. Null = leave the stage as it is.
 */
export function stageAfterSilence(seq: { outreachType: string; stage: string; lastReplyAt: Date | null }): "NOT_INTERESTED" | null {
  if (MANUAL_OR_TERMINAL_STAGES.includes(seq.stage)) return null;
  if (seq.outreachType === "CREATOR" && (seq.stage === "RATE_RECEIVED" || seq.stage === "INTERESTED" || seq.lastReplyAt)) return null;
  return "NOT_INTERESTED";
}

/**
 * What a reply written by the team means for a brand's pipeline stage. "auto": a brand that asked
 * for the creator list has now been answered, so it moves to Creator List Sent. "keep": leave the
 * stage alone (the reply was a question, a holding note…). "list-sent": mark the list as sent
 * whatever stage it was at.
 */
export type ReplyStageChoice = "auto" | "keep" | "list-sent";

// A reply never moves a thread out of a stage the team set by hand or that ends the pipeline.
const STAGES_A_REPLY_LEAVES_ALONE = [...MANUAL_OR_TERMINAL_STAGES, "CREATOR_LIST_SENT"];

/** The stage a brand thread moves to when the team replies, or null to leave it as it is. */
export function stageAfterReply(outreachType: string, stage: string, choice: ReplyStageChoice): "CREATOR_LIST_SENT" | null {
  if (outreachType !== "BRAND" || choice === "keep" || STAGES_A_REPLY_LEAVES_ALONE.includes(stage)) return null;
  if (choice === "list-sent") return "CREATOR_LIST_SENT";
  return stage === "CREATOR_LIST_REQUESTED" ? "CREATOR_LIST_SENT" : null;
}

export interface SequenceState {
  status: SequenceStatus;
  currentStep: number; // 0 = only Email 1 sent, 1-3 = that follow-up has been sent
}

/**
 * PRD §47 — pure state transition. Throws if called on a sequence already in a final state.
 *
 * `maxSteps` defaults to the standard 3-follow-up cadence (Email 1 -> Follow-up 1/2/3). The
 * creator-list nudge cadence is the one exception — it passes 4 so a final CEO-voice close-out
 * goes out after the 3rd nudge instead of completing immediately.
 */
export function advanceState(state: SequenceState, event: SequenceEvent, maxSteps: number = MAX_FOLLOW_UPS): SequenceState {
  if (FINAL_STATUSES.includes(state.status) && event !== "RESUME") {
    return state; // final states are terminal; no-op
  }

  switch (event) {
    case "REPLY":
      return { ...state, status: "REPLIED" };
    case "BOUNCE":
      return { ...state, status: "BOUNCED" };
    case "UNSUBSCRIBE":
      return { ...state, status: "UNSUBSCRIBED" };
    case "STOP":
      return { ...state, status: "STOPPED" };
    case "PAUSE":
      return { ...state, status: "PAUSED" };
    case "RESUME":
      return state.status === "PAUSED"
        ? { ...state, status: stepStatus(state.currentStep) }
        : state;
    case "NO_REPLY_ADVANCE": {
      // The caller invokes this right after actually sending follow-up/nudge #nextStep — so
      // reaching maxSteps here *is* "the final one just went out with no reply," and should
      // complete immediately rather than waiting for a send that no template exists for.
      const nextStep = state.currentStep + 1;
      if (nextStep >= maxSteps) {
        return { currentStep: maxSteps, status: "COMPLETED" };
      }
      return { currentStep: nextStep, status: stepStatus(nextStep) as SequenceStatus };
    }
    default:
      return state;
  }
}

function stepStatus(step: number): SequenceStatus {
  if (step === 0) return "WAITING_FOR_REPLY";
  return (`FOLLOW_UP_${step}_SENT` as SequenceStatus);
}

export function isActiveForSending(status: SequenceStatus): boolean {
  return (
    status === "WAITING_FOR_REPLY" ||
    status === "FOLLOW_UP_1_SENT" ||
    status === "FOLLOW_UP_2_SENT" ||
    status === "FOLLOW_UP_3_SENT" ||
    status === "FOLLOW_UP_4_SENT"
  );
}
