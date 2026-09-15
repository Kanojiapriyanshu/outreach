import { describe, it, expect } from "vitest";
import { personalizeFromChannel, DEFAULT_DELIVERABLE } from "../outreachPersonalization";

const homeTitles = [
  "Living Room Makeover on a Budget | Before & After",
  "Styling My Home for Fall — Cozy Home Decor Ideas",
  "Affordable Amazon Home Upgrades Under $50",
  "Is This $400 Sofa Worth It? Honest Review",
  "Decorating My Shelves Over 50 | Midlife Home Refresh",
  "Budget Bedroom Makeover Transformation",
  "Home Decor Haul: Target Finds",
  "Midlife Morning Routine in My 50s",
  "Small Living Room Furniture Layout Ideas",
  "Thrifted Decor Styling Tips",
];

describe("personalizeFromChannel", () => {
  it("writes highlights from topics that recur in the titles, subjects first", () => {
    const result = personalizeFromChannel({ channelTitle: "Jane Doe Home", videoTitles: homeTitles });
    // Styling shows in 5 titles, furniture in 3, midlife in 2 — in that order, never a topic seen once.
    expect(result.variables.Content_Highlights).toBe("home styling, furniture, and midlife lifestyle content");
    expect(result.variables.Creator_Name).toBe("Jane Doe Home");
    expect(result.topics[0].videos).toBeGreaterThanOrEqual(2);
  });

  it("takes the brand category and video type from the campaign when given", () => {
    const result = personalizeFromChannel({
      channelTitle: "Jane Doe Home",
      videoTitles: homeTitles,
      campaign: { brandCategory: "home furniture/living", deliverable: "dedicated sofa review" },
    });
    expect(result.variables.Niche_Or_Product_Category).toBe("home furniture/living");
    expect(result.variables.Deliverable_Type).toBe("dedicated sofa review");
    expect(result.categorySource).toBe("campaign");
  });

  it("falls back to the channel's strongest subject for the category, and a dedicated review", () => {
    const result = personalizeFromChannel({ channelTitle: "Jane Doe Home", videoTitles: homeTitles });
    expect(result.variables.Niche_Or_Product_Category).toBe("home furniture/living");
    expect(result.categorySource).toBe("channel");
    expect(result.variables.Deliverable_Type).toBe(DEFAULT_DELIVERABLE);
  });

  it("ignores a topic mentioned once in a long list of uploads", () => {
    const titles = [...Array(10)].map((_, i) => `Treadmill workout ${i + 1}`).concat(["My dog tried it"]);
    const result = personalizeFromChannel({ channelTitle: "Run Club", videoTitles: titles });
    expect(result.variables.Content_Highlights).toBe("fitness content");
    expect(result.variables.Niche_Or_Product_Category).toBe("fitness & wellness");
  });

  it("doesn't let tags or the description invent a topic the titles don't show", () => {
    const result = personalizeFromChannel({
      channelTitle: "Cook With Sam",
      videoTitles: ["Easy weeknight recipes", "Meal prep for the week", "Air fryer dinner ideas"],
      videoTags: ["gaming", "minecraft"],
      description: "Travel, beauty and gaming vlogs",
    });
    expect(result.variables.Content_Highlights).toBe("cooking content");
  });

  it("stays readable when nothing recognisable recurs", () => {
    const result = personalizeFromChannel({ channelTitle: "Abstract", videoTitles: ["Episode 1", "Episode 2"], nicheHint: "art supplies" });
    expect(result.variables.Content_Highlights).toBe("videos");
    expect(result.variables.Niche_Or_Product_Category).toBe("art supplies");
    expect(result.categorySource).toBe("niche");
  });
});
