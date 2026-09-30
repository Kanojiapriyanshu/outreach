import { describe, it, expect } from "vitest";
import { PUBLIC_ROSTER_WHERE, ROSTER_ELIGIBLE, creatorCategories, slugTag, topCategories } from "../publicRosterRules";

describe("public roster eligibility", () => {
  it("takes creators who are interested or gave a rate, and never anyone who opted out", () => {
    const rule = JSON.stringify(ROSTER_ELIGIBLE);
    expect(rule).toContain("quotedRateAt");
    expect(rule).toContain("INTERESTED");
    expect(rule).toContain("RATE_RECEIVED");
    expect(rule).not.toContain("NOT_INTERESTED");
    expect(JSON.stringify(ROSTER_ELIGIBLE.NOT)).toContain("UNSUBSCRIBED");
  });

  it("leaves hidden creators off the public page", () => {
    expect(JSON.stringify(PUBLIC_ROSTER_WHERE)).toContain('"rosterHidden":false');
  });
});

describe("roster categories", () => {
  const SEARCH_KEYWORDS = "tech, gadget, gaming, desk, gaming chair, ergonomic chair, office chair, speaker, headphone, earbud";

  it("reads the leading search terms and the creator's own content, not the whole keyword list", () => {
    expect(creatorCategories({ niche: SEARCH_KEYWORDS, contentHighlights: "gaming and tech content" })).toEqual(["Tech", "Gaming"]);
    expect(creatorCategories({ niche: SEARCH_KEYWORDS, contentHighlights: "home organization, tech, and travel content" })).toEqual([
      "Tech",
      "Home & living",
      "Lifestyle",
    ]);
    expect(creatorCategories({ niche: "skincare, beauty, skincare routine, makeup", contentHighlights: "" })).toEqual(["Beauty"]);
    expect(creatorCategories({ niche: "printing, printer, fdm printing", contentHighlights: null })).toEqual(["3D printing & making"]);
  });

  it("falls back to the channel name, and leaves a creator untagged rather than guessing", () => {
    expect(creatorCategories({ niche: "Keo Prints", name: "Keo Prints" })).toEqual(["3D printing & making"]);
    expect(creatorCategories({ niche: null, name: "Jordyn Vlogs" })).toEqual(["Lifestyle"]);
    expect(creatorCategories({ niche: "Electroheads", name: "Electroheads" })).toEqual([]);
  });

  it("only tags plain reviews when nothing more specific fits", () => {
    expect(creatorCategories({ niche: null, contentHighlights: "product review content" })).toEqual(["Product reviews"]);
    expect(creatorCategories({ niche: "tech unboxing reviews" })).toEqual(["Tech"]);
  });

  it("ranks categories by how many creators are in them", () => {
    expect(topCategories([["Tech", "Gaming"], ["Tech"], ["Beauty"], []])).toEqual([
      { tag: "Tech", slug: "tech", count: 2 },
      { tag: "Beauty", slug: "beauty", count: 1 },
      { tag: "Gaming", slug: "gaming", count: 1 },
    ]);
    expect(slugTag("Home & living")).toBe("home-living");
  });
});
