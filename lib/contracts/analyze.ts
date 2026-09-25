/**
 * The deal check: reads a contract the way the person signing it for Fidem should — money
 * exposure first, then gaps a brand could exploit, then housekeeping. Deterministic, so it runs
 * on every keystroke; the optional AI review (lib/contracts/aiReview.ts) covers free-text edits
 * these rules can't judge.
 */
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { PROTECTIVE_CLAUSES, buildContract, clauseTitle, formatContractDate, type BuiltContract, type ContractData, type ContractFields } from "./template";

export type Severity = "blocker" | "risk" | "tip";

/** A one-click fix: set these fields, or put a removed clause back. */
export type QuickFix = { label: string; fields?: Partial<ContractFields>; restoreClause?: string };

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Which part of the contract it's about — the editor scrolls the preview there. */
  sectionId?: string;
  /** Which left-hand field to focus to deal with it. */
  field?: keyof ContractFields;
  fix?: QuickFix;
}

export interface DealSummary {
  fee: number | null;
  currency: string;
  deposit: number | null;
  balance: number | null;
  depositDueBy: string | null;
  margin: number | null;
  marginPercent: number | null;
  /** How much of what Fidem owes the creator the deposit covers (1 = fully). */
  depositCoversCreator: number | null;
  nonCircumventionUntil: string | null;
  scriptDueDays: number;
  draftDueDays: number;
}

const FREE_MAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton(mail)?|qq|163|126)\./i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** yyyy-mm-dd plus N business days (Mon–Fri; public holidays aren't known here). */
export function addBusinessDays(iso: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return date.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

export function dealSummary(f: ContractFields): DealSummary {
  const fee = f.fee !== null && Number.isFinite(f.fee) ? f.fee : null;
  const pct = Math.min(100, Math.max(0, f.depositPercent)) / 100;
  const deposit = fee !== null ? Math.round(fee * pct * 100) / 100 : null;
  const cost = f.creatorCost !== null && Number.isFinite(f.creatorCost) ? f.creatorCost : null;
  return {
    fee,
    currency: f.currency || "USD",
    deposit,
    balance: fee !== null && deposit !== null ? Math.round((fee - deposit) * 100) / 100 : null,
    depositDueBy: f.effectiveDate && pct > 0 ? addBusinessDays(f.effectiveDate, f.depositBusinessDays) : null,
    margin: fee !== null && cost !== null ? fee - cost : null,
    marginPercent: fee !== null && cost !== null && fee > 0 ? ((fee - cost) / fee) * 100 : null,
    depositCoversCreator: deposit !== null && cost !== null && cost > 0 ? deposit / cost : null,
    nonCircumventionUntil: f.effectiveDate ? addMonths(f.effectiveDate, f.nonCircumventionMonths) : null,
    scriptDueDays: f.scriptDays,
    draftDueDays: f.draftDays,
  };
}

function money(n: number, currency: string): string {
  return formatMoney(n, currency || "USD");
}

export function analyzeContract(data: ContractData, built: BuiltContract = buildContract(data), today = new Date()): Finding[] {
  const f = data.fields;
  const out: Finding[] = [];
  const deal = dealSummary(f);
  const todayIso = today.toISOString().slice(0, 10);

  // --- Blockers: the contract shouldn't go to the brand like this. -------------------------
  if (!f.clientName.trim()) out.push({ id: "client-name", severity: "blocker", title: "Client name is blank", detail: "The Parties table has no client — the contract doesn't say who is bound by it.", sectionId: "parties", field: "clientName" });
  if (!f.brandName.trim()) out.push({ id: "brand-name", severity: "blocker", title: "Brand is blank", detail: "Name the brand the campaign is for.", sectionId: "parties", field: "brandName" });
  if (!EMAIL_RE.test(f.clientEmail.trim())) out.push({ id: "client-email", severity: "blocker", title: "Client email missing or invalid", detail: "Clause 3 confirms campaigns \"in writing (including by email)\" — without a valid address there's no agreed channel.", sectionId: "parties", field: "clientEmail" });
  if (deal.fee === null || deal.fee <= 0) out.push({ id: "fee", severity: "blocker", title: "No campaign fee", detail: "The Agreed Rate row reads \"[fee to be confirmed]\" — the brand could argue no price was agreed.", sectionId: "scope", field: "fee" });
  if (f.creators.length === 0) out.push({ id: "creators", severity: "blocker", title: "No creator named", detail: "Selected Creator(s) is blank. Add at least one — pick from your roster to fill it in.", sectionId: "scope", field: "creators" });
  if (!f.campaignName.trim()) out.push({ id: "campaign", severity: "blocker", title: "Campaign name is blank", detail: "Give the campaign a name so later emails can refer to it unambiguously.", sectionId: "scope", field: "campaignName" });

  for (const id of built.removed) {
    if (!PROTECTIVE_CLAUSES.has(id)) continue;
    out.push({
      id: `removed-${id}`,
      severity: "blocker",
      title: `${clauseTitle(id)} was removed`,
      detail:
        id === "noncircumvention"
          ? "This is the clause that stops the brand hiring your creators directly after this campaign. Without it, every creator you introduce is a creator you can lose."
          : `This clause protects Fidem. Removing it shifts risk onto you — only do it if the brand insisted and you priced that in.`,
      fix: { label: "Put it back", restoreClause: id },
    });
  }

  // Broken "Clause N" references — usually from an edited clause that still cites old numbers.
  const maxNumber = Math.max(0, ...built.sections.map((s) => s.number));
  for (const s of built.sections) {
    const text = [s.body, s.note, ...s.table.map((r) => r.value)].join(" ");
    if (text.includes("[removed clause:")) {
      out.push({ id: `ref-removed-${s.id}`, severity: "blocker", title: `${s.number ? `Clause ${s.number}` : s.title} points to a removed clause`, detail: "It refers to a clause you took out. Edit the wording or put the clause back.", sectionId: s.id });
    }
    for (const match of text.matchAll(/Clauses? ((?:\d+(?:, (?:and )?| and )?)+)/g)) {
      const cited = match[1].match(/\d+/g)?.map(Number) ?? [];
      const bad = cited.filter((n) => n < 1 || n > maxNumber);
      if (bad.length && s.edited) {
        out.push({ id: `ref-${s.id}-${bad.join("-")}`, severity: "blocker", title: `Clause ${s.number} cites Clause ${bad.join(", ")}, which doesn't exist`, detail: `This contract has ${maxNumber} clauses. The edited wording still uses an old number.`, sectionId: s.id });
      }
    }
  }

  // --- Risks: legal or commercial exposure worth a decision. --------------------------------
  if (deal.depositCoversCreator !== null && deal.depositCoversCreator < 1) {
    out.push({
      id: "deposit-vs-creator",
      severity: "risk",
      title: `Deposit covers only ${Math.round(deal.depositCoversCreator * 100)}% of what you owe the creator`,
      detail: `You collect ${money(deal.deposit!, deal.currency)} upfront but owe the creator ${money(f.creatorCost!, deal.currency)}. If the brand stalls on the balance, Fidem funds the gap.`,
      sectionId: "fees",
      field: "depositPercent",
      fix: f.fee ? { label: `Raise deposit to cover the creator`, fields: { depositPercent: Math.min(100, Math.ceil(((f.creatorCost ?? 0) / f.fee) * 100 / 5) * 5) } } : undefined,
    });
  }
  if (deal.marginPercent !== null && deal.marginPercent < 15) {
    out.push({
      id: "margin",
      severity: "risk",
      title: deal.marginPercent < 0 ? "You lose money on this deal" : `Thin margin: ${deal.marginPercent.toFixed(0)}%`,
      detail: `Fee ${money(deal.fee!, deal.currency)} vs creator cost ${money(f.creatorCost!, deal.currency)} leaves ${money(deal.margin!, deal.currency)} for sourcing, negotiation, revisions and payment risk.`,
      field: "fee",
    });
  }
  if (f.depositPercent < 50 && f.depositPercent > 0) {
    out.push({ id: "low-deposit", severity: "risk", title: `Only ${f.depositPercent}% upfront`, detail: "Your standard is 50%. Less upfront means more of the fee depends on the brand paying after the work is done.", sectionId: "fees", field: "depositPercent", fix: { label: "Use 50%", fields: { depositPercent: 50 } } });
  }
  if (f.depositPercent === 0) {
    out.push({ id: "no-deposit", severity: "risk", title: "Nothing is paid upfront", detail: "The whole fee is due only before go-live — you'd source, negotiate and brief entirely on credit.", sectionId: "fees", field: "depositPercent", fix: { label: "Use 50%", fields: { depositPercent: 50 } } });
  }
  if (f.usageRights === "tbc") {
    out.push({
      id: "usage-undefined",
      severity: "risk",
      title: "Usage rights are never defined",
      detail: "The Usage Rights row says \"to be confirmed\" and the usage clause licenses content \"for the period agreed\" — a period that's never agreed. A brand could argue for open-ended paid use, which creators charge extra for.",
      sectionId: "usage",
      field: "usageRights",
      fix: { label: "Set 30 days, organic only", fields: { usageRights: "defined", usageDays: 30, usagePaid: false } },
    });
  }
  if (!f.governingLaw.trim()) {
    out.push({
      id: "governing-law",
      severity: "risk",
      title: "No governing law",
      detail: "The dispute clause only promises to agree a forum later. If the brand stops paying or hires your creators directly, you'd first have to negotiate where you're even allowed to sue.",
      sectionId: "disputes",
      field: "governingLaw",
    });
  }
  if (f.nonCircumventionMonths < 6) {
    out.push({ id: "noncirc-short", severity: "risk", title: `Non-circumvention is only ${f.nonCircumventionMonths} months`, detail: "Brands typically re-book good creators within a year. Your standard is 12 months.", sectionId: "noncircumvention", field: "nonCircumventionMonths", fix: { label: "Use 12 months", fields: { nonCircumventionMonths: 12 } } });
  }
  if (f.creatorShippingAddress.trim() || f.creators.some((c) => c.realName.trim())) {
    out.push({
      id: "creator-identity",
      severity: "risk",
      title: "The brand's copy shows the creator's real name / home address",
      detail: "That's everything the brand needs to contact the creator without you. The non-circumvention clause covers it legally, but the cheapest protection is not handing it over — share the address only in the shipping email, or ship via Fidem.",
      sectionId: "scope",
      field: "creatorShippingAddress",
    });
  }
  if (f.effectiveDate && f.effectiveDate < todayIso) {
    out.push({ id: "backdated", severity: "risk", title: "Effective date is in the past", detail: `It's set to ${formatContractDate(f.effectiveDate)}. Backdating is fine if work already started — otherwise use today.`, sectionId: "parties", field: "effectiveDate", fix: { label: "Use today", fields: { effectiveDate: todayIso } } });
  }

  // --- Tips: tighten before sending. -------------------------------------------------------
  if (!f.effectiveDate) out.push({ id: "effective-date", severity: "tip", title: "Effective date is blank", detail: "It prints as a line to fill by hand. Setting it also lets the deal summary work out when the deposit is due.", sectionId: "parties", field: "effectiveDate", fix: { label: "Use today", fields: { effectiveDate: todayIso } } });
  if (FREE_MAIL.test(f.clientEmail)) {
    out.push({ id: "free-mail", severity: "tip", title: "Client uses a personal email", detail: `${f.clientEmail.trim()} isn't a company address. Confirm they're authorised to sign for ${f.brandName.trim() || "the brand"} — or add the brand as a signing party.`, sectionId: "parties", field: "clientEmail" });
  }
  if (f.lateFeePercentMonthly === null) {
    out.push({ id: "late-fee", severity: "tip", title: "Late-payment charge is vague", detail: "\"A reasonable additional charge … communicated in advance\" is hard to enforce. A stated rate is clearer for both sides.", sectionId: "fees", field: "lateFeePercentMonthly", fix: { label: "Set 1.5% per month", fields: { lateFeePercentMonthly: 1.5 } } });
  }
  if (!f.clientSignatoryName.trim()) out.push({ id: "client-signatory", severity: "tip", title: "Client signatory not named", detail: "Pre-fill who signs for the client so the right person signs.", sectionId: "signatures", field: "clientSignatoryName", fix: f.clientName.trim() ? { label: `Use ${f.clientName.trim()}`, fields: { clientSignatoryName: f.clientName.trim() } } : undefined });
  if (f.feedbackBusinessDays > 5) out.push({ id: "feedback-slow", severity: "tip", title: `Brand has ${f.feedbackBusinessDays} business days per review`, detail: "Every review round adds this to the timeline, and creators lose momentum. Your standard is 3.", sectionId: "timeline", field: "feedbackBusinessDays", fix: { label: "Use 3 days", fields: { feedbackBusinessDays: 3 } } });
  if (f.depositBusinessDays > 14) out.push({ id: "deposit-slow", severity: "tip", title: `Deposit due only after ${f.depositBusinessDays} business days`, detail: "You'll usually have briefed the creator by then. Your standard is 7.", sectionId: "fees", field: "depositBusinessDays", fix: { label: "Use 7 days", fields: { depositBusinessDays: 7 } } });
  if (f.draftDays <= f.scriptDays) out.push({ id: "timeline-order", severity: "tip", title: "Draft is due before (or with) the script", detail: `Script in ${f.scriptDays} days, draft in ${f.draftDays} — the draft should come after the script is approved.`, sectionId: "timeline", field: "draftDays" });
  if (f.deemedAcceptanceOnShipment && f.productType !== "none") {
    out.push({ id: "deemed-acceptance", severity: "tip", title: "Shipment counts as acceptance", detail: "Useful when brands ship without signing, but it's weaker than a signature. Get the countersigned copy before the deposit deadline where you can.", sectionId: "scope" });
  }

  const order: Record<Severity, number> = { blocker: 0, risk: 1, tip: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
