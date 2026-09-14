import { describe, it, expect } from "vitest";
import {
  analyzeCreatorReplyHeuristic,
  extractQuotedRates,
  amountsInText,
  currenciesInText,
  mergeRates,
  primaryRate,
  formatRate,
  stripOwnQuotedLines,
  findEmailAddresses,
  parseStoredRates,
} from "../creatorReplyAnalysis";

const intent = (text: string) => analyzeCreatorReplyHeuristic(text).intent;

describe("extractQuotedRates", () => {
  it("reads a single dollar rate and what it's for", () => {
    const [rate] = extractQuotedRates("Thanks for reaching out! My rate for a dedicated video is $1,200.");
    expect(rate).toMatchObject({ amount: 1200, amountMax: null, currency: "USD", deliverable: "Dedicated video" });
  });

  it("labels each price by its own deliverable", () => {
    const rates = extractQuotedRates("$1,500 for a dedicated video and $800 for an integration.");
    expect(rates.map((r) => [r.amount, r.deliverable])).toEqual([
      [1500, "Dedicated video"],
      [800, "Integration"],
    ]);
    const listed = extractQuotedRates("Dedicated: $1,500\nIntegration: $700\nShorts: $300");
    expect(listed.map((r) => [r.amount, r.deliverable])).toEqual([
      [1500, "Dedicated video"],
      [700, "Integration"],
      [300, "Short-form"],
    ]);
  });

  it("reads ranges, k-suffixes and currency written after the number", () => {
    expect(extractQuotedRates("I usually charge $2k-$3k depending on deliverables")[0]).toMatchObject({
      amount: 2000,
      amountMax: 3000,
      currency: "USD",
    });
    expect(extractQuotedRates("It would be 950 USD for a dedicated video")[0]).toMatchObject({ amount: 950, currency: "USD" });
    expect(extractQuotedRates("1.5k EUR per video")[0]).toMatchObject({ amount: 1500, currency: "EUR" });
    expect(extractQuotedRates("my fee is ₹45,000")[0]).toMatchObject({ amount: 45000, currency: "INR" });
  });

  it("keeps a bare rate but never invents its currency", () => {
    const [rate] = extractQuotedRates("my rate is 800 for a dedicated video");
    expect(rate).toMatchObject({ amount: 800, currency: null, deliverable: "Dedicated video" });
    expect(formatRate(rate)).toBe("800 (no currency given) · Dedicated video");
  });

  it("ignores subscriber, view and duration counts", () => {
    expect(extractQuotedRates("I have 250k subscribers and about 40,000 views per video")).toEqual([]);
    expect(extractQuotedRates("my rate depends — I have 800 views avg and 12 minute videos")).toEqual([]);
    expect(extractQuotedRates("our rates for 2027 aren't set yet")).toEqual([]);
  });
});

describe("analyzeCreatorReplyHeuristic", () => {
  it("treats a quoted price as a rate even alongside other signals", () => {
    const analysis = analyzeCreatorReplyHeuristic("Yes I'm interested! $900 for a dedicated video.");
    expect(analysis.intent).toBe("RATE_SHARED");
    expect(analysis.rates[0].amount).toBe(900);
    expect(intent("Not interested at a $200 budget, but my rate is $900")).toBe("RATE_SHARED");
  });

  it("flags a rate card it can't read instead of guessing a number", () => {
    const analysis = analyzeCreatorReplyHeuristic("Hi! I've attached my rate card, let me know.");
    expect(analysis.intent).toBe("RATE_SHARED");
    expect(analysis.rates).toEqual([]);
    expect(analysis.rateNote).toMatch(/rate card/i);
  });

  it("separates opt-outs from declines", () => {
    expect(intent("Please remove me from your list.")).toBe("OPT_OUT");
    expect(intent("Thanks, but I'm not interested.")).toBe("UNINTERESTED");
    expect(intent("I'm fully booked until December, sorry!")).toBe("UNINTERESTED");
    expect(intent("Unfortunately I don't do sponsored content.")).toBe("UNINTERESTED");
  });

  it("reads questions about the brand or budget as interest", () => {
    expect(intent("Sure! What's the brand?")).toBe("INTERESTED");
    expect(intent("Can you share more details about the product first?")).toBe("INTERESTED");
    expect(intent("What's your budget for this?")).toBe("INTERESTED");
    expect(intent("Yes")).toBe("INTERESTED");
  });

  it("doesn't read 'not sure' as a yes", () => {
    expect(intent("I'm not sure this fits my channel")).not.toBe("INTERESTED");
  });

  it("keeps following up only on a genuine 'I'll get back to you'", () => {
    expect(intent("Let me check my schedule and get back to you.")).toBe("NON_COMMITTAL");
  });

  it("hands ambiguous replies to the team rather than nudging again", () => {
    expect(intent("Thanks!")).toBe("HUMAN_REPLY");
    expect(intent("How did you find my channel?")).toBe("HUMAN_REPLY");
    expect(intent("")).toBe("HUMAN_REPLY");
  });

  it("recognises an out-of-office body the headers didn't flag", () => {
    expect(intent("I am currently out of office and will respond when I return.")).toBe("AUTO_REPLY");
  });

  it("doesn't mistake our own quoted email for interest", () => {
    const ours = "Before sharing further brand details, I wanted to check: would you be open to a paid collaboration?";
    const reply = `Thanks!\n> ${ours}`;
    expect(analyzeCreatorReplyHeuristic(reply, [ours]).intent).toBe("HUMAN_REPLY");
    expect(stripOwnQuotedLines(reply, [ours])).toBe("Thanks!");
  });
});

describe("rate helpers", () => {
  it("verifies amounts and currencies against the text", () => {
    expect(amountsInText("between 1.5k and $2,000")).toEqual([1500, 2000]);
    expect([...currenciesInText("$900 or 800 EUR")].sort()).toEqual(["EUR", "USD"]);
  });

  it("merges a later quote over the same deliverable only", () => {
    const first = extractQuotedRates("Dedicated: $1,500\nIntegration: $700");
    const later = extractQuotedRates("I can do $1,200 for a dedicated video");
    const merged = mergeRates(first, later);
    expect(merged.map((r) => [r.deliverable, r.amount])).toEqual([
      ["Dedicated video", 1200],
      ["Integration", 700],
    ]);
    expect(primaryRate(merged)?.amount).toBe(1200);
  });

  it("reads stored JSON defensively", () => {
    expect(parseStoredRates(null)).toEqual([]);
    expect(parseStoredRates([{ amount: "900" }, { amount: 900, currency: "USD" }])).toEqual([
      { amount: 900, amountMax: null, currency: "USD", deliverable: null, raw: "", source: "reply" },
    ]);
  });

  it("finds a redirect address in the reply", () => {
    expect(findEmailAddresses("Please reach my manager at Talent@Agency.com")).toEqual(["talent@agency.com"]);
  });
});
