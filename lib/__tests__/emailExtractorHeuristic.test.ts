import { describe, it, expect } from "vitest";
import { extractBrandDetailsHeuristic } from "../emailExtractorHeuristic";

const AGENCY_EMAIL = `Hi,

My name is Joanna from MRD Media.

We've been following your content and really appreciate the way you create technology-related content and share your experiences with your audience.

We believe your content style and audience would be a great fit for an upcoming collaboration campaign we are preparing.

We are on behalf of a leading company in wearable display technology, creating innovative AR glasses and immersive personal screen experiences.

For this upcoming campaign, we are looking to partner with creators who can introduce products through authentic content and showcase how wearable technology can enhance everyday experiences.

We would love to explore a potential collaboration opportunity with you.

Could you please share:
Your collaboration rates
Media kit
Availability during our campaign period
Campaign Details:
Platform:
YouTube

Deliverables:
1 YouTube Video (5-15 minutes)
7 days Link in Bio Placement
30 days Writelisting
Expected Campaign Timeline:
August 28- Sept.4

Looking forward to hearing from you.

Best regards,
Joanna
Meridian Media`;

const BRAND_EMAIL = `Hi MHD Tech,

Hope this message finds you well!

We are reaching out on behalf of libernovo, and we're excited to explore the possibility of collaborating with you on a YouTube promotional campaign.

Your creativity and engaging style align perfectly with our vision for this collaboration, and we believe your audience would resonate with the libernovo brand.

We are particularly interested in promoting the following products:

Product 1
Our product is priced at a premium, and if you are interested in collaborating, we would be pleased to provide free samples and would operate under an 3% pure commission model.

We are looking forward to your thoughts on this exciting opportunity!

Best regards,
libernovo Team`;

const EEZYCOLLAB_EMAIL = `Hey Enoylity Technology,

I hope you are having a great week！

My name is James from EezyCollab. We are currently working with DubbingAI on their voice changer earbuds and love the content you create.

We'd love to collaborate with you on a 5-8min dedicated video showcasing Review of DubbingAI Earbuds！

If this sounds like something you would be interested in, could you please let us know your standard rate for a dedicated video?

If you don't provide a dedicated video, you can also provide a rate for a integrated video.

Thanks for your time, and I look forward to hearing from you.

Best regards,

James

EezyCollab Team`;

describe("extractBrandDetailsHeuristic — real sample emails, no API key", () => {
  it("extracts agency name, deliverables, timeline, and influencer hints from the agency email", () => {
    const result = extractBrandDetailsHeuristic(AGENCY_EMAIL);
    expect(result.contactName).toBe("Joanna");
    // The actual brand is never named in this email (only described), so the agency's own
    // name is the best available answer — either "MRD Media" (intro line) or "Meridian Media"
    // (signature) is an acceptable extraction.
    expect(result.brandOrAgencyName).toMatch(/media/i);
    expect(result.isAgency).toBe(true);
    expect(result.deliverables).toMatch(/YouTube Video/i);
    expect(result.deliverables).toMatch(/Writelisting/i);
    expect(result.campaignTimeline).toMatch(/Aug/i);

    // The client brand is never named in this email — only its product is described. The
    // template variable must NOT fall back to the agency's own name (that would read as
    // "leading the Meridian Media campaign", which is nonsense); it should derive a stand-in
    // from the product category instead.
    expect(result.campaignOrProductName).toBe("AR Glasses");
    expect(result.campaignOrProductName?.toLowerCase()).not.toContain("media");
    expect(result.nicheCategories).toMatch(/wearable/i);
    expect(result.keyProductFeatures).toMatch(/AR glasses/i);
    // {Target_Audience_Or_Angle} should be derived from the detected category, not left blank.
    expect(result.targetAudienceOrAngle).toMatch(/AR|glasses/i);
  });

  it("extracts brand name, commission budget, and correctly marks it as NOT an agency", () => {
    const result = extractBrandDetailsHeuristic(BRAND_EMAIL);
    expect(result.brandOrAgencyName?.toLowerCase()).toContain("libernovo");
    expect(result.campaignOrProductName?.toLowerCase()).toContain("libernovo");
    expect(result.isAgency).toBe(false);
    expect(result.budgetType).toBe("HYBRID"); // commission + free samples
    expect(result.budgetRangeText).toMatch(/3%/);
    // This email never describes what the product actually is ("Product 1", generic), so there's
    // nothing honest to derive an angle from — it should stay undefined rather than invent one.
    expect(result.targetAudienceOrAngle).toBeUndefined();
  });

  it("finds the client brand named via 'working with X on their Y' distinct from the agency's own name", () => {
    const result = extractBrandDetailsHeuristic(EEZYCOLLAB_EMAIL);
    // "EezyCollab" is the agency (sender) — must NOT leak "Team" suffix, and must not be
    // mistaken for the client brand.
    expect(result.brandOrAgencyName).toBe("EezyCollab");
    // "DubbingAI" is the actual client brand being pitched — this is what must appear in the
    // email body, not "EezyCollab" (which would read as nonsense: "leading the EezyCollab
    // Team campaign").
    expect(result.campaignOrProductName).toBe("DubbingAI");
    expect(result.isAgency).toBe(true);
    expect(result.contactName).toBe("James");
    expect(result.keyProductFeatures).toMatch(/voice changer earbuds/i);
    expect(result.targetAudienceOrAngle).toMatch(/earbuds/i);
    // Stray full-width punctuation ("！") from the source text must never leak into extracted fields.
    expect(result.brandOrAgencyName).not.toMatch(/[！-～]/);
    expect(result.campaignOrProductName).not.toMatch(/[！-～]/);
    expect(result.keyProductFeatures).not.toMatch(/[！-～]/);
  });

  it("returns an empty object for empty input instead of throwing", () => {
    expect(extractBrandDetailsHeuristic("")).toEqual({});
    expect(extractBrandDetailsHeuristic("   ")).toEqual({});
  });

  it("never requires network access or an API key — purely synchronous regex/keyword matching", () => {
    // extractBrandDetailsHeuristic has no async signature and does not import the Anthropic SDK.
    const result = extractBrandDetailsHeuristic("Contact us at hello@example.com about a $500 flat fee deal.");
    expect(result.contactEmail).toBe("hello@example.com");
    expect(result.budgetType).toBe("FLAT_FEE");
  });

  it("keeps the lower bound of a subscriber range instead of collapsing it to the upper one", () => {
    // Previously the number-matching regex only accepted a keyword (subscribers/etc.) or
    // whitespace directly after the unit, so "50K-500K" (no space before the dash) silently lost
    // the "50K" and reported min === max === 500000.
    const result = extractBrandDetailsHeuristic("We're looking for creators in the 50K-500K subscriber range.");
    expect(result.influencerRangeMin).toBe(50_000);
    expect(result.influencerRangeMax).toBe(500_000);
  });

  it("records an either/or commission offer as HYBRID with both figures, not just whichever regex matched first", () => {
    const result = extractBrandDetailsHeuristic("Comp: either a flat $500 or 15% affiliate commission, your choice.");
    expect(result.budgetType).toBe("HYBRID");
    expect(result.budgetRangeText).toMatch(/\$500/);
    expect(result.budgetRangeText).toMatch(/15%/);
  });

  it("picks up the sender's name and company from an intro sentence, not only a signature block", () => {
    const result = extractBrandDetailsHeuristic(
      "Hi there, I'm Sarah and I'm a Talent Partnerships Manager at BrightWave Media, a creator marketing agency. " +
        "We're running a campaign for one of our clients, Nuvo Home, launching their new smart home hub."
    );
    expect(result.contactName).toBe("Sarah");
    expect(result.brandOrAgencyName).toBe("BrightWave Media");
    expect(result.campaignOrProductName).toBe("Nuvo Home");
    expect(result.category).toBe("smart home hub");
  });

  it("reads a timeline joined with 'and' as well as a dash", () => {
    const result = extractBrandDetailsHeuristic("The campaign would need to go live between October 5 and October 20.");
    expect(result.campaignTimeline).toMatch(/October 5.*October 20/);
  });
});
