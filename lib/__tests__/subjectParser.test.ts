import { describe, it, expect } from "vitest";
import { extractNamesFromSubject } from "../subjectParser";

describe("extractNamesFromSubject", () => {
  it("pulls the brand name from the front of a direct-brand subject", () => {
    expect(
      extractNamesFromSubject("Quelsoft × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine")
    ).toEqual({ brandOrAgencyName: "Quelsoft", campaignOrProductName: "Quelsoft", isAgency: false });
  });

  it("strips a Re: prefix (including doubled) on a follow-up subject", () => {
    expect(extractNamesFromSubject("Re: Quelsoft × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine").brandOrAgencyName).toBe(
      "Quelsoft"
    );
    expect(
      extractNamesFromSubject("Re: Re: Quelsoft × Fidem Growth — Turning Your US Growth Into a Creator-Led Profit Engine").brandOrAgencyName
    ).toBe("Quelsoft");
  });

  it("pulls the agency name from the middle and the real brand from the trailing 'for X'", () => {
    expect(extractNamesFromSubject("Fidem Growth × Seedbox — Creator Sourcing Support for Hi3D")).toEqual({
      brandOrAgencyName: "Seedbox",
      campaignOrProductName: "Hi3D",
      isAgency: true,
    });
  });

  it("falls back to the agency name as the campaign name when there's no trailing 'for X'", () => {
    expect(extractNamesFromSubject("Fidem Growth × Seedbox — Creator Partnerships, Agency to Agency")).toEqual({
      brandOrAgencyName: "Seedbox",
      campaignOrProductName: "Seedbox",
      isAgency: true,
    });
  });

  it("returns nothing when the subject doesn't follow the convention at all", () => {
    expect(extractNamesFromSubject("Just checking in")).toEqual({});
  });

  it("returns nothing when neither side is Fidem Growth", () => {
    expect(extractNamesFromSubject("Alice × Bob — some other partnership")).toEqual({});
  });
});
