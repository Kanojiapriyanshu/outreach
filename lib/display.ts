import { budgetTypeLabel } from "@/lib/friendlyLabels";

export function stageLabel(currentStep: number): string {
  if (currentStep === 0) return "First email sent";
  return `Follow-up #${currentStep} sent`;
}

export function nextActionLabel(status: string, pendingStep?: number): string {
  if (status === "REPLIED") return "They replied";
  if (status === "BOUNCED") return "Email bounced";
  if (status === "UNSUBSCRIBED") return "Stopped — opted out";
  if (status === "STOPPED") return "Stopped";
  if (status === "COMPLETED") return "All done";
  if (status === "PAUSED") return "Paused";
  if (pendingStep) return `Follow-up #${pendingStep} coming up`;
  return "—";
}

export function companyOrCreatorName(contact: {
  brand?: { name: string } | null;
  creator?: { name: string } | null;
}): string {
  return contact.brand?.name ?? contact.creator?.name ?? "—";
}

export function gmailThreadLink(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

export function budgetLabel(budgetRangeText: string | null, budgetType: string): string {
  const typeLabel = budgetType === "UNKNOWN" ? "" : budgetTypeLabel(budgetType).toLowerCase();
  if (budgetRangeText && typeLabel) return `${budgetRangeText} (${typeLabel})`;
  if (budgetRangeText) return budgetRangeText;
  if (typeLabel) return typeLabel;
  return "—";
}

export function influencerRangeLabel(min: number | null, max: number | null): string {
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `Up to ${fmt(max)}`;
  return "—";
}
