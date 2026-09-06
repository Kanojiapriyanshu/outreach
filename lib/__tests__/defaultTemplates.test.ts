import { describe, it, expect } from "vitest";
import { brandTemplates, brandAgencyTemplates, creatorTemplates } from "../defaultTemplates";

// PRD §60 — subject-line acceptance criteria: Brand name must come before "Fidem Growth",
// Creator subjects must put "Fidem Growth" before the creator name, and the two orders
// must never be reversed for either track. The Agency variant of the Brand track still
// pitches the same brand, so it keeps the same ordering rule.
describe("default template subject-line ordering (PRD §60)", () => {
  it("every Brand (direct) template subject puts {Brand_Or_Campaign_Name} before Fidem Growth", () => {
    for (const t of brandTemplates) {
      const brandIndex = t.subject.indexOf("{Brand_Or_Campaign_Name}");
      const fidemIndex = t.subject.indexOf("Fidem Growth");
      expect(brandIndex).toBeGreaterThanOrEqual(0);
      expect(fidemIndex).toBeGreaterThan(brandIndex);
    }
  });

  it("every Brand (agency) template subject also puts {Brand_Or_Campaign_Name} before Fidem Growth", () => {
    for (const t of brandAgencyTemplates) {
      const brandIndex = t.subject.indexOf("{Brand_Or_Campaign_Name}");
      const fidemIndex = t.subject.indexOf("Fidem Growth");
      expect(brandIndex).toBeGreaterThanOrEqual(0);
      expect(fidemIndex).toBeGreaterThan(brandIndex);
    }
  });

  it("every Creator template subject puts Fidem Growth before {Creator_Name}", () => {
    for (const t of creatorTemplates) {
      const fidemIndex = t.subject.indexOf("Fidem Growth");
      const creatorIndex = t.subject.indexOf("{Creator_Name}");
      expect(fidemIndex).toBeGreaterThanOrEqual(0);
      expect(creatorIndex).toBeGreaterThan(fidemIndex);
    }
  });

  it("follow-up subjects are threaded with Re: to preserve the original thread", () => {
    for (const t of [...brandTemplates.slice(1), ...brandAgencyTemplates.slice(1), ...creatorTemplates.slice(1)]) {
      expect(t.subject.startsWith("Re: ")).toBe(true);
    }
  });

  it("Brand direct and Agency variants exist for all 4 steps and use only Brand-track variables", () => {
    expect(brandTemplates.map((t) => t.step).sort()).toEqual([1, 2, 3, 4]);
    expect(brandAgencyTemplates.map((t) => t.step).sort()).toEqual([1, 2, 3, 4]);
    for (const t of brandAgencyTemplates) {
      expect(t.body).not.toMatch(/\{Creator_Name\}|\{Deliverable_Type\}/);
    }
  });

  it("Agency templates greet the contact by name and never reference {Target_Audience_Or_Angle}", () => {
    // The Agency pitch sells the product on its own merits ("agency to agency"), not an
    // audience-comparison angle — so this variable should never be required for that track,
    // and the required-variables check (lib/trackSequence.ts) derives requirements straight
    // from what each template actually contains, so omitting it here is enough to make it
    // optional end-to-end.
    for (const t of brandAgencyTemplates) {
      expect(t.body).toMatch(/\{Contact_Name\}/);
      expect(t.body).not.toMatch(/\{Target_Audience_Or_Angle\}/);
    }
  });
});
