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

/** PRD §25 — validates a template before activation/use. */
export function validateTemplate(
  subject: string,
  body: string,
  outreachType: "BRAND" | "CREATOR"
): TemplateValidationResult {
  const errors: string[] = [];
  if (!subject || !subject.trim()) errors.push("Subject is empty.");
  if (!body || !body.trim()) errors.push("Body is empty.");

  const allowed = new Set(variablesForType(outreachType));
  const used = new Set<string>();
  for (const match of `${subject}\n${body}`.matchAll(/\{([A-Za-z_]+)\}/g)) {
    used.add(match[1]);
  }
  for (const v of used) {
    if (!allowed.has(v)) {
      errors.push(`Variable {${v}} is not supported for ${outreachType} templates.`);
    }
  }

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
