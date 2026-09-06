import { describe, it, expect } from "vitest";
import { classifyReplyHeuristic } from "../replyClassifierHeuristic";

const preList = { creatorListAlreadySent: false };
const postList = { creatorListAlreadySent: true };

describe("classifyReplyHeuristic", () => {
  it("catches explicit opt-outs", () => {
    expect(classifyReplyHeuristic("Please stop emailing me, thanks.", preList)).toBe("OPT_OUT");
    expect(classifyReplyHeuristic("Can you remove me from your list?", preList)).toBe("OPT_OUT");
    expect(classifyReplyHeuristic("Unsubscribe please.", preList)).toBe("OPT_OUT");
  });

  it("catches a soft decline as UNINTERESTED, not OPT_OUT", () => {
    expect(classifyReplyHeuristic("Thanks but this isn't a good fit for us right now.", preList)).toBe(
      "UNINTERESTED"
    );
    expect(classifyReplyHeuristic("We'll pass on this one.", preList)).toBe("UNINTERESTED");
  });

  it("catches a request for the creator list before it's been sent", () => {
    expect(classifyReplyHeuristic("Sounds exciting! Kindly send me the creator list.", preList)).toBe(
      "WANTS_CREATOR_LIST"
    );
    expect(classifyReplyHeuristic("Happy to move forward, please send over the profiles.", preList)).toBe(
      "WANTS_CREATOR_LIST"
    );
  });

  it("does not offer WANTS_CREATOR_LIST once the list has already been sent", () => {
    expect(classifyReplyHeuristic("Sounds exciting! Kindly send me the creator list.", postList)).not.toBe(
      "WANTS_CREATOR_LIST"
    );
  });

  it("catches a decisive creator choice only after the list was sent", () => {
    expect(classifyReplyHeuristic("Let's go with this one, sounds great.", postList)).toBe("CREATOR_CHOSEN");
    expect(classifyReplyHeuristic("We want this creator for the campaign.", postList)).toBe("CREATOR_CHOSEN");
    expect(classifyReplyHeuristic("Let's go with this one, sounds great.", preList)).not.toBe("CREATOR_CHOSEN");
  });

  it("catches non-committal acknowledgments", () => {
    expect(classifyReplyHeuristic("Ok, we'll see. We will understand and get back to you.", preList)).toBe(
      "NON_COMMITTAL"
    );
    expect(classifyReplyHeuristic("Noted, will check with the team.", preList)).toBe("NON_COMMITTAL");
    expect(classifyReplyHeuristic("Thanks!", preList)).toBe("NON_COMMITTAL");
  });

  it("falls back to HUMAN_REPLY for substantive, unmatched replies", () => {
    expect(
      classifyReplyHeuristic(
        "We're planning a Q3 campaign across three product lines and want to know your creator vetting process before we commit budget.",
        preList
      )
    ).toBe("HUMAN_REPLY");
  });

  it("treats an empty snippet as HUMAN_REPLY", () => {
    expect(classifyReplyHeuristic("", preList)).toBe("HUMAN_REPLY");
    expect(classifyReplyHeuristic("   ", preList)).toBe("HUMAN_REPLY");
  });
});
