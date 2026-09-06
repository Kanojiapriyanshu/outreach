import { describe, it, expect } from "vitest";
import { renderTemplate, validateTemplate, findUnresolvedVariables, variablesForType } from "../templates";

describe("renderTemplate", () => {
  it("substitutes known variables", () => {
    const out = renderTemplate("Hi {Contact_Name}, re {Brand_Or_Campaign_Name}", {
      Contact_Name: "Summer",
      Brand_Or_Campaign_Name: "Whale Echo",
    });
    expect(out).toBe("Hi Summer, re Whale Echo");
  });

  it("leaves unresolved variables untouched", () => {
    const out = renderTemplate("Hi {Contact_Name}", {});
    expect(out).toBe("Hi {Contact_Name}");
  });
});

describe("findUnresolvedVariables", () => {
  it("finds all remaining {Variable} tokens", () => {
    expect(findUnresolvedVariables("Hi {Contact_Name}, re {Brand_Or_Campaign_Name}")).toEqual([
      "Contact_Name",
      "Brand_Or_Campaign_Name",
    ]);
  });

  it("returns empty array when fully rendered", () => {
    expect(findUnresolvedVariables("Hi Summer")).toEqual([]);
  });
});

describe("validateTemplate", () => {
  it("rejects empty subject or body", () => {
    expect(validateTemplate("", "body", "BRAND").valid).toBe(false);
    expect(validateTemplate("subject", "", "BRAND").valid).toBe(false);
  });

  it("rejects a Creator variable used in a Brand template", () => {
    const result = validateTemplate("Hi {Creator_Name}", "body", "BRAND");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Creator_Name/);
  });

  it("accepts a valid Brand template using only Brand variables", () => {
    const result = validateTemplate(
      "{Brand_Or_Campaign_Name} × Fidem Growth",
      "Hi {Contact_Name}, {Niche_Categories}",
      "BRAND"
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("variablesForType", () => {
  it("returns the correct isolated variable set per track", () => {
    expect(variablesForType("BRAND")).toContain("Brand_Or_Campaign_Name");
    expect(variablesForType("BRAND")).not.toContain("Creator_Name");
    expect(variablesForType("CREATOR")).toContain("Creator_Name");
    expect(variablesForType("CREATOR")).not.toContain("Brand_Or_Campaign_Name");
  });
});
