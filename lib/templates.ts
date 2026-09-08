export const BRAND_VARIABLES = [
  "Contact_Name",
  "Brand_Or_Campaign_Name",
  "Niche_Categories",
  "Key_Product_Features",
  "Target_Audience_Or_Angle",
] as const;

export const CREATOR_VARIABLES = [
  "Creator_Name",
  "Niche_Or_Product_Category",
  "Deliverable_Type",
] as const;

export function variablesForType(outreachType: "BRAND" | "CREATOR"): readonly string[] {
  return outreachType === "BRAND" ? BRAND_VARIABLES : CREATOR_VARIABLES;
}

/** Replaces {Variable_Name} tokens with values. Leaves unresolved tokens untouched (caller validates). */
export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{([A-Za-z_]+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Only checks that there's actually something to send. The team has full freedom to write a
 * template however they want — using any {tag} they like (or none at all), reusing a tag from
 * the other track, made-up ones, whatever — nothing here restricts template content to a fixed
 * variable list. Any {tag} that isn't one this system knows how to fill just renders as-is,
 * exactly like typing literal curly braces on purpose, and the compose flow's editable draft
 * lets the team remove or replace it before a real send either way.
 */
export function validateTemplate(subject: string, body: string): TemplateValidationResult {
  const errors: string[] = [];
  if (!subject || !subject.trim()) errors.push("Subject is empty.");
  if (!body || !body.trim()) errors.push("Body is empty.");
  return { valid: errors.length === 0, errors };
}

/** PRD §25 — the system must not send an email with unresolved variables. */
export function findUnresolvedVariables(renderedText: string): string[] {
  const found: string[] = [];
  for (const match of renderedText.matchAll(/\{([A-Za-z_]+)\}/g)) {
    found.push(match[1]);
  }
  return found;
}
