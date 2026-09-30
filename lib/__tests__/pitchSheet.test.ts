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
  pitchLinkToken,
  pitchSheetUrl,
  slugifyLinkName,
} from "../pitchSheet";
import { matchSnippet, rosterWhere, searchTerms } from "../creatorRoster";
import { looksLikeCreatorPitch } from "../creatorPitchRule";

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

describe("short brand links", () => {
  it("turns a brand or campaign name into a clean link name", () => {
    expect(slugifyLinkName("ChitaLiving")).toBe("chitaliving");
    expect(slugifyLinkName("Glössier & Co. — Q4 Picks!")).toBe("glossier-and-co-q4-picks");
    expect(slugifyLinkName("  ***  ")).toBe("");
    expect(slugifyLinkName("a".repeat(80))).toHaveLength(40);
  });

  it("adds a short unguessable code without look-alike characters", () => {
    const token = pitchLinkToken("Hbada Fall", new Uint8Array([0, 1, 2, 3, 4, 250]));
    expect(token).toMatch(/^hbada-fall-[a-z2-9]{6}$/);
    const code = token.slice("hbada-fall-".length);
    expect(code).not.toMatch(/[01ilo]/);
    expect(pitchLinkToken("", new Uint8Array(6))).toMatch(/^shortlist-[a-z2-9]{6}$/);
  });

  it("builds the short URL", () => {
    expect(pitchSheetUrl("https://app.fidemgrowth.com", "hbada-k7m2qx")).toBe("https://app.fidemgrowth.com/p/hbada-k7m2qx");
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

describe("Gmail creator-pitch rule", () => {
  it("tells Fidem's creator pitches from its brand pitches by the opening", () => {
    expect(looksLikeCreatorPitch("Fidem Growth × Cozy K — Paid Home/Lifestyle Collab", "Hello Kennedy, This is Yash from Fidem Growth — we work with US-based creators on paid brand collaborations. I've been following your content")).toBe(true);
    expect(looksLikeCreatorPitch("Paid Brand Opportunity: HBADA", "Hello Adam, We have an exciting collaboration opportunity for you with Hbada. We have your proposed rate of $800 USD")).toBe(true);
    expect(looksLikeCreatorPitch("HUANUO × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine", "Hello Ginman, The chair feels built for exactly the kind of content that converts on YouTube right now. We work with pre-vetted creators")).toBe(false);
    expect(looksLikeCreatorPitch("Linkols × Fidem Growth — Campaign", "Hello Kaye, I saw you're leading the Twotrees campaign on the agency side, so I figured it made more sense to reach out agency-to-agency")).toBe(false);
  });
});
