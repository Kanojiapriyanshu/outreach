import { describe, it, expect } from "vitest";
import { advanceState, isActiveForSending, stageAfterSilence, FINAL_STATUSES, MAX_FOLLOW_UPS, type SequenceState } from "../stateMachine";

describe("advanceState", () => {
  it("moves WAITING_FOR_REPLY -> FOLLOW_UP_1_SENT on NO_REPLY_ADVANCE", () => {
    const next = advanceState({ status: "WAITING_FOR_REPLY", currentStep: 0 }, "NO_REPLY_ADVANCE");
    expect(next).toEqual({ status: "FOLLOW_UP_1_SENT", currentStep: 1 });
  });

  it("advances through follow-ups 1 and 2, then completes right after follow-up 3 — no 4th send", () => {
    let state: SequenceState = { status: "WAITING_FOR_REPLY", currentStep: 0 };
    for (let i = 1; i < MAX_FOLLOW_UPS; i++) {
      state = advanceState(state, "NO_REPLY_ADVANCE");
      expect(state.currentStep).toBe(i);
      expect(state.status).toBe(`FOLLOW_UP_${i}_SENT`);
    }
    // The MAX_FOLLOW_UPS-th call is the one made right after sending that final follow-up —
    // there's no template for a 4th send, so this must complete immediately, not wait for one.
    state = advanceState(state, "NO_REPLY_ADVANCE");
    expect(state.status).toBe("COMPLETED");
    expect(state.currentStep).toBe(MAX_FOLLOW_UPS);
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

  it("with a maxSteps override, advances through steps 1-3 then completes right after step 4 — the creator-list nudge's final close-out", () => {
    let state: SequenceState = { status: "WAITING_FOR_REPLY", currentStep: 0 };
    for (let i = 1; i < 4; i++) {
      state = advanceState(state, "NO_REPLY_ADVANCE", 4);
      expect(state.currentStep).toBe(i);
      expect(state.status).toBe(i === 4 ? "FOLLOW_UP_4_SENT" : `FOLLOW_UP_${i}_SENT`);
    }
    state = advanceState(state, "NO_REPLY_ADVANCE", 4);
    expect(state.status).toBe("COMPLETED");
    expect(state.currentStep).toBe(4);
  });
});

describe("stageAfterSilence", () => {
  const replied = new Date("2026-09-20T10:00:00Z");

  it("marks a brand or creator who never answered as Not Interested", () => {
    expect(stageAfterSilence({ outreachType: "BRAND", stage: "FIRST_EMAIL_SENT", lastReplyAt: null })).toBe("NOT_INTERESTED");
    expect(stageAfterSilence({ outreachType: "BRAND", stage: "CREATOR_LIST_SENT", lastReplyAt: replied })).toBe("NOT_INTERESTED");
    expect(stageAfterSilence({ outreachType: "CREATOR", stage: "FIRST_EMAIL_SENT", lastReplyAt: null })).toBe("NOT_INTERESTED");
  });

  it("never buries an influencer who already replied under Not Interested", () => {
    expect(stageAfterSilence({ outreachType: "CREATOR", stage: "RATE_RECEIVED", lastReplyAt: replied })).toBeNull();
    expect(stageAfterSilence({ outreachType: "CREATOR", stage: "INTERESTED", lastReplyAt: replied })).toBeNull();
    // Replied with a question, the team answered by hand, then the check-ins went unanswered.
    expect(stageAfterSilence({ outreachType: "CREATOR", stage: "FIRST_EMAIL_SENT", lastReplyAt: replied })).toBeNull();
  });

  it("leaves a stage the team set by hand alone", () => {
    for (const stage of ["NEGOTIATION", "CREATOR_SELECTED", "DEAL", "NOT_INTERESTED"]) {
      expect(stageAfterSilence({ outreachType: "BRAND", stage, lastReplyAt: null })).toBeNull();
    }
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
