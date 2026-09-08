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
    expect(validateTemplate("", "body").valid).toBe(false);
    expect(validateTemplate("subject", "").valid).toBe(false);
  });

  it("allows any {tag} — templates aren't restricted to a fixed variable list", () => {
    const result = validateTemplate("Hi {Creator_Name}", "body mentions {AnythingAtAll}");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a template with no variables at all", () => {
    const result = validateTemplate("Just a plain subject", "Just a plain body, no tags here.");
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
