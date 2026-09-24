import { describe, it, expect } from "vitest";
import {
  brandEmailDraft,
  brandRateFromQuote,
  brandRateLine,
  daysLeft,
  expiryFromDays,
  gmailComposeUrl,
  isReadyToPitch,
  linkState,
} from "../pitchSheet";
import { matchSnippet, rosterWhere, searchTerms } from "../creatorRoster";

const NOW = new Date("2026-09-24T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("isReadyToPitch", () => {
  it("allows creators who replied or gave a rate, and no one else", () => {
    expect(isReadyToPitch({ replied: true, hasRate: false })).toBe(true);
    expect(isReadyToPitch({ replied: false, hasRate: true })).toBe(true);
    expect(isReadyToPitch({ replied: false, hasRate: false })).toBe(false);
  });
});

describe("link expiry", () => {
  it("defaults to 30 days and treats 0 as never", () => {
    expect(expiryFromDays(undefined, NOW)!.getTime() - NOW.getTime()).toBe(30 * DAY);
    expect(expiryFromDays(7, NOW)!.getTime() - NOW.getTime()).toBe(7 * DAY);
    expect(expiryFromDays(0, NOW)).toBeNull();
    expect(expiryFromDays(10_000, NOW)!.getTime() - NOW.getTime()).toBe(365 * DAY);
  });

  it("reports live, expired and turned-off links", () => {
    expect(linkState({ expiresAt: new Date(NOW.getTime() + DAY), revokedAt: null }, NOW)).toBe("live");
    expect(linkState({ expiresAt: null, revokedAt: null }, NOW)).toBe("live");
    expect(linkState({ expiresAt: new Date(NOW.getTime() - 1), revokedAt: null }, NOW)).toBe("expired");
    expect(linkState({ expiresAt: null, revokedAt: NOW }, NOW)).toBe("turned-off");
  });

  it("counts whole days left", () => {
    expect(daysLeft(new Date(NOW.getTime() + 29.5 * DAY), NOW)).toBe(30);
    expect(daysLeft(null, NOW)).toBeNull();
  });
});

describe("brand rate", () => {
  it("adds the margin and rounds up to a clean number", () => {
    expect(brandRateFromQuote(800, 25)).toBe(1000);
    expect(brandRateFromQuote(910, 25)).toBe(1150);
    expect(brandRateFromQuote(800, 0)).toBe(800);
    expect(brandRateFromQuote(null, 25)).toBeNull();
  });

  it("writes the line the brand reads", () => {
    expect(brandRateLine({ brandRate: 1500, brandRateCurrency: "USD", deliverable: "Dedicated video", rateNote: null })).toBe("Dedicated video — $1,500");
    expect(brandRateLine({ brandRate: 1500, brandRateCurrency: null, deliverable: null, rateNote: "plus product" })).toBe("$1,500 (plus product)");
    expect(brandRateLine({ brandRate: null, brandRateCurrency: null, deliverable: null, rateNote: null })).toBe("Rate on request");
  });
});

describe("brand email", () => {
  it("includes the link and names every creator", () => {
    const { subject, body } = brandEmailDraft({ brandName: "ChitaLiving", url: "https://x.test/pitch-sheet/abc", creatorNames: ["GoTechGeek", "Janine"], expiresAt: null });
    expect(subject).toBe("Creator shortlist for ChitaLiving — 2 creators");
    expect(body).toContain("https://x.test/pitch-sheet/abc");
    expect(body).toContain("• GoTechGeek");
    expect(body).toContain("• Janine");
  });

  it("builds a Gmail compose link without sending anything", () => {
    const url = new URL(gmailComposeUrl("brand@x.test", "Hi", "Body"));
    expect(url.hostname).toBe("mail.google.com");
    expect(url.searchParams.get("to")).toBe("brand@x.test");
    expect(url.searchParams.get("su")).toBe("Hi");
  });
});

describe("smart search", () => {
  it("keeps the words that describe the creator and drops the filler", () => {
    expect(searchTerms("creators who did a smart home project before")).toEqual(["smart", "home"]);
    expect(searchTerms("SwitchBot")).toEqual(["switchbot"]);
    expect(searchTerms("project")).toEqual(["project"]);
    expect(searchTerms("   ")).toEqual([]);
  });

  it("requires every word to match somewhere, and folds in media-kit title matches", () => {
    const where = rosterWhere({ q: "smart lock", email: "", platform: "", status: "", sort: "recent" }, { smart: ["c1"] });
    const and = (where as { AND: { OR: unknown[] }[] }).AND;
    expect(and).toHaveLength(2);
    expect(JSON.stringify(and[0].OR)).toContain("lastReplyText");
    expect(and[0].OR).toContainEqual({ id: { in: ["c1"] } });
    expect(and[1].OR).not.toContainEqual({ id: { in: ["c1"] } });
  });

  it("filters to creators who replied or have a rate", () => {
    const where = rosterWhere({ q: "", email: "", platform: "", status: "ready", sort: "recent" });
    expect(JSON.stringify(where)).toContain("quotedRateAt");
    expect(JSON.stringify(where)).toContain("lastReplyAt");
  });

  it("quotes where the match was, preferring what they told us", () => {
    const hit = matchSnippet(
      [
        { label: "In their reply", text: "Happy to help! I did a smart lock review for Aqara last month and it went well." },
        { label: "In their videos", text: "Best smart home gadgets" },
      ],
      ["smart"]
    );
    expect(hit?.label).toBe("In their reply");
    expect(hit?.snippet).toContain("smart lock review");
    expect(matchSnippet([{ label: "x", text: "nothing here" }], ["smart"])).toBeNull();
  });
});
