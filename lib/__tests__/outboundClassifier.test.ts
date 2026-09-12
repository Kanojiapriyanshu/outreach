import { describe, it, expect } from "vitest";
import { classifyByKeywords } from "../outboundClassifier";

describe("classifyByKeywords", () => {
  it("reads channel/subscriber language as creator outreach", () => {
    const result = classifyByKeywords(
      "Collab opportunity",
      "Hey! Love your channel and what you've built with your subscribers. Would you be up for a dedicated video?"
    );
    expect(result.outreachType).toBe("CREATOR");
  });

  it("reads brand/campaign language as brand outreach, DIRECT by default", () => {
    const result = classifyByKeywords(
      "Quick question about your brand",
      "We run influencer marketing campaigns and think your product would be a great fit for our creators."
    );
    expect(result.outreachType).toBe("BRAND");
    if (result.outreachType === "BRAND") expect(result.recipientType).toBe("DIRECT");
  });

  it("flags AGENCY when an agency-specific word is also present", () => {
    const result = classifyByKeywords(
      "Partnership",
      "We're a talent partnerships agency helping brands run influencer marketing campaigns."
    );
    expect(result.outreachType).toBe("BRAND");
    if (result.outreachType === "BRAND") expect(result.recipientType).toBe("AGENCY");
  });

  it("returns null rather than guessing when nothing distinctive is present", () => {
    const result = classifyByKeywords("Hey", "Just checking in, let me know when you're free to chat.");
    expect(result.outreachType).toBeNull();
  });

  it("prefers whichever side has more matches when both appear", () => {
    // Two creator-side phrases against one ambiguous brand-ish word shouldn't flip it to BRAND.
    const result = classifyByKeywords("Hi", "Love your channel and your content — is this your brand's official page?");
    expect(result.outreachType).toBe("CREATOR");
  });
});
