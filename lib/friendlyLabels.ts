/**
 * Plain-language labels for every technical name/enum shown in the UI. One place to keep the
 * whole app readable by someone who has never seen a template variable or a database enum.
 */

export const VARIABLE_LABELS: Record<string, { label: string; hint: string }> = {
  Contact_Name: { label: "Contact's name", hint: "Who you're emailing" },
  Brand_Or_Campaign_Name: { label: "Brand or campaign name", hint: "What to call it in the email" },
  Niche_Categories: { label: "Creator niche", hint: "e.g. tech, gaming, beauty" },
  Key_Product_Features: { label: "Standout features", hint: "What makes the product worth reviewing" },
  Target_Audience_Or_Angle: { label: "What shoppers compare this to", hint: "e.g. \"wireless earbuds\", \"WFH setup\"" },
  Creator_Name: { label: "Creator's name", hint: "" },
  Niche_Or_Product_Category: { label: "Product category", hint: "e.g. tech gadget" },
  Deliverable_Type: { label: "Type of video", hint: "e.g. dedicated review" },
};

export function variableLabel(key: string): string {
  return VARIABLE_LABELS[key]?.label ?? key.replace(/_/g, " ");
}

export function variableHint(key: string): string {
  return VARIABLE_LABELS[key]?.hint ?? "";
}

export const BUDGET_TYPE_LABELS: Record<string, string> = {
  UNKNOWN: "Not sure yet",
  FLAT_FEE: "Flat fee",
  COMMISSION: "Commission",
  PRODUCT_ONLY: "Free product only",
  HYBRID: "Fee + product",
};

export const BUDGET_TYPE_OPTIONS = Object.keys(BUDGET_TYPE_LABELS) as (keyof typeof BUDGET_TYPE_LABELS)[];

export function budgetTypeLabel(type: string): string {
  return BUDGET_TYPE_LABELS[type] ?? type;
}
