import { describe, it, expect } from "vitest";
import { advanceState, isActiveForSending, FINAL_STATUSES, MAX_FOLLOW_UPS, type SequenceState } from "../stateMachine";

describe("advanceState", () => {
  it("moves WAITING_FOR_REPLY -> FOLLOW_UP_1_SENT on NO_REPLY_ADVANCE", () => {
    const next = advanceState({ status: "WAITING_FOR_REPLY", currentStep: 0 }, "NO_REPLY_ADVANCE");
    expect(next).toEqual({ status: "FOLLOW_UP_1_SENT", currentStep: 1 });
  });

  it("advances through all three follow-ups then completes", () => {
    let state: SequenceState = { status: "WAITING_FOR_REPLY", currentStep: 0 };
    for (let i = 1; i <= MAX_FOLLOW_UPS; i++) {
      state = advanceState(state, "NO_REPLY_ADVANCE");
      expect(state.currentStep).toBe(i);
    }
    state = advanceState(state, "NO_REPLY_ADVANCE");
    expect(state.status).toBe("COMPLETED");
  });

  it("never sends a 4th follow-up", () => {
    let state: SequenceState = { status: "FOLLOW_UP_3_SENT", currentStep: 3 };
    state = advanceState(state, "NO_REPLY_ADVANCE");
    expect(state.status).toBe("COMPLETED");
    expect(state.currentStep).toBe(3);
  });

  it("REPLY immediately stops the sequence regardless of step", () => {
    const next = advanceState({ status: "FOLLOW_UP_2_SENT", currentStep: 2 }, "REPLY");
    expect(next.status).toBe("REPLIED");
  });

  it("BOUNCE, UNSUBSCRIBE, STOP each move to their terminal status", () => {
    expect(advanceState({ status: "WAITING_FOR_REPLY", currentStep: 0 }, "BOUNCE").status).toBe("BOUNCED");
    expect(advanceState({ status: "WAITING_FOR_REPLY", currentStep: 0 }, "UNSUBSCRIBE").status).toBe("UNSUBSCRIBED");
    expect(advanceState({ status: "WAITING_FOR_REPLY", currentStep: 0 }, "STOP").status).toBe("STOPPED");
  });

  it("is a no-op once in a final state", () => {
    for (const status of FINAL_STATUSES) {
      const state = { status, currentStep: 1 };
      expect(advanceState(state, "NO_REPLY_ADVANCE")).toEqual(state);
      expect(advanceState(state, "REPLY")).toEqual(state);
    }
  });

  it("PAUSE then RESUME returns to the correct step status", () => {
    const paused = advanceState({ status: "FOLLOW_UP_2_SENT", currentStep: 2 }, "PAUSE");
    expect(paused.status).toBe("PAUSED");
    const resumed = advanceState(paused, "RESUME");
    expect(resumed).toEqual({ status: "FOLLOW_UP_2_SENT", currentStep: 2 });
  });

  it("RESUME is a no-op when not paused", () => {
    const state = { status: "WAITING_FOR_REPLY" as const, currentStep: 0 };
    expect(advanceState(state, "RESUME")).toEqual(state);
  });
});

describe("isActiveForSending", () => {
  it("is true only for waiting/follow-up-sent statuses", () => {
    expect(isActiveForSending("WAITING_FOR_REPLY")).toBe(true);
    expect(isActiveForSending("FOLLOW_UP_1_SENT")).toBe(true);
    expect(isActiveForSending("FOLLOW_UP_3_SENT")).toBe(true);
    expect(isActiveForSending("REPLIED")).toBe(false);
    expect(isActiveForSending("PAUSED")).toBe(false);
    expect(isActiveForSending("COMPLETED")).toBe(false);
  });
});
