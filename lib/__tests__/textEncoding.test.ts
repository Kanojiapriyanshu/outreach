import { describe, it, expect } from "vitest";
import { repairMojibake } from "../textEncoding";

describe("repairMojibake", () => {
  const correct = "Fidem Growth × TechJoint — Paid Collaboration Opportunity";

  it("undoes one round of UTF-8 read as Windows-1252", () => {
    expect(repairMojibake("Fidem Growth Ã— TechJoint â€” Paid Collaboration Opportunity")).toBe(correct);
  });

  it("undoes the double round a reply to a garbled subject produces", () => {
    expect(repairMojibake("Fidem Growth ÃƒÂ— TechJoint Ã¢Â€Â” Paid Collaboration Opportunity")).toBe(correct);
    expect(repairMojibake("Re: HBADA Ã— Fidem Growth â€” Turning Your US Growth")).toBe("Re: HBADA × Fidem Growth — Turning Your US Growth");
  });

  it("leaves correct text alone, including real accents, emoji and other scripts", () => {
    for (const text of [correct, "São Paulo creators", "Crème brûlée review", "Café — menu", "Collab 🎉", "नमस्ते", "Plain ASCII", ""]) {
      expect(repairMojibake(text)).toBe(text);
    }
  });
});
