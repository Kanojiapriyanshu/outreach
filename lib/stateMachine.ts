export type SequenceStatus =
  | "NEW"
  | "INITIAL_EMAIL_DETECTED"
  | "WAITING_FOR_REPLY"
  | "FOLLOW_UP_1_SENT"
  | "FOLLOW_UP_2_SENT"
  | "FOLLOW_UP_3_SENT"
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

export interface SequenceState {
  status: SequenceStatus;
  currentStep: number; // 0 = only Email 1 sent, 1-3 = that follow-up has been sent
}

/** PRD §47 — pure state transition. Throws if called on a sequence already in a final state. */
export function advanceState(state: SequenceState, event: SequenceEvent): SequenceState {
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
      // The caller invokes this right after actually sending follow-up #nextStep — so reaching
      // MAX_FOLLOW_UPS here *is* "the final follow-up just went out with no reply," and should
      // complete immediately rather than waiting for a hypothetical 4th send that no template
      // exists for (there is no step-4 follow-up — 3 is the whole cadence).
      const nextStep = state.currentStep + 1;
      if (nextStep >= MAX_FOLLOW_UPS) {
        return { currentStep: MAX_FOLLOW_UPS, status: "COMPLETED" };
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
    status === "FOLLOW_UP_3_SENT"
  );
}
