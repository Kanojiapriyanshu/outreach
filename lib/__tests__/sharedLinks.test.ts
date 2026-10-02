import { describe, it, expect } from "vitest";
import { mentionsPitchSheetLink, mentionsRosterLink, sharesCreators } from "../sharedLinks";

describe("roster link detection", () => {
  it("finds the public roster link on any host, with or without a niche", () => {
    expect(mentionsRosterLink("Here is our roster: https://app.fidemgrowth.com/roster")).toBe(true);
    expect(mentionsRosterLink("https://outreach-abc.vercel.app/roster?niche=tech — take a look")).toBe(true);
    expect(mentionsRosterLink('<a href="https://app.fidemgrowth.com/roster">our creators</a>')).toBe(true);
    expect(mentionsRosterLink("Roster <https://app.fidemgrowth.com/roster>.")).toBe(true);
  });

  it("ignores the team's own admin tab, look-alike paths and plain mentions", () => {
    expect(mentionsRosterLink("https://app.fidemgrowth.com/influencers/roster")).toBe(false);
    expect(mentionsRosterLink("https://example.com/rosters")).toBe(false);
    expect(mentionsRosterLink("https://example.com/roster-2026")).toBe(false);
    expect(mentionsRosterLink("We'll send our roster next week.")).toBe(false);
    expect(mentionsRosterLink(null)).toBe(false);
  });
});

describe("pitch sheet link detection", () => {
  it("finds short and original pitch-sheet links", () => {
    expect(mentionsPitchSheetLink("https://app.fidemgrowth.com/p/baseus-k7m2qx")).toBe(true);
    expect(mentionsPitchSheetLink("https://app.fidemgrowth.com/pitch-sheet/EmUzekaslcnrOvCpyDZJqavjEUGDMbNL")).toBe(true);
    expect(mentionsPitchSheetLink("https://app.fidemgrowth.com/pricing")).toBe(false);
  });

  it("treats either link as creators being shared", () => {
    expect(sharesCreators("see https://x.test/roster")).toBe(true);
    expect(sharesCreators("see https://x.test/p/brand-abc234")).toBe(true);
    expect(sharesCreators("Thanks, talk soon!")).toBe(false);
  });
});
