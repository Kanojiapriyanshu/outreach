/**
 * The Fidem Growth client services agreement as a template: every number, name and date comes from
 * ContractFields, so changing a field updates every clause that mentions it. Clause numbers and
 * "Clause N" cross-references are worked out when the contract is built, so removing a clause
 * renumbers the rest instead of leaving references pointing at the wrong section.
 *
 * Pure — no Prisma, no I/O — so the editor preview, the PDF page, the analyzer and the tests all
 * build the exact same document.
 */
import { formatMoney } from "@/lib/creatorReplyAnalysis";

export interface ContractCreator {
  /** Channel name, e.g. "Shopping with Amy". */
  name: string;
  /** Person's name, e.g. "Amanda Ignash" — optional; shown in brackets after the channel. */
  realName: string;
  channelUrl: string;
}

export interface ContractFields {
  agencyContactName: string;
  agencyContactTitle: string;
  agencyContactEmail: string;

  clientName: string;
  /** "on behalf of her agency and SEVVS" — how the client signs; optional. */
  clientRepresents: string;
  clientEmail: string;
  brandName: string;
  productName: string;
  /** yyyy-mm-dd, or "" for a blank line to fill by hand. */
  effectiveDate: string;

  campaignName: string;
  creators: ContractCreator[];
  deliverables: string;
  productType: "retail" | "prototype" | "none";
  creatorShippingAddress: string;
  shippingPaidBy: "client" | "fidem";
  /** yyyy-mm-dd, or "" = coordinated after draft approval. */
  goLiveDate: string;

  usageRights: "tbc" | "defined";
  usageDays: number;
  usagePaid: boolean;

  fee: number | null;
  currency: string;
  depositPercent: number;
  depositBusinessDays: number;
  /** Late-payment charge in % per month; null keeps the softer "reasonable charge" wording. */
  lateFeePercentMonthly: number | null;

  scriptDays: number;
  draftDays: number;
  feedbackBusinessDays: number;
  revisionRounds: number;

  deemedAcceptanceOnShipment: boolean;
  nonCircumventionMonths: number;
  terminationNoticeDays: number;
  /** "the State of New York, USA" — "" keeps the agree-a-forum-later wording. */
  governingLaw: string;

  fidemSignatoryName: string;
  clientSignatoryName: string;

  /** Internal only — what Fidem pays the creator(s). Never printed; drives the margin checks. */
  creatorCost: number | null;
}

export interface ClauseEdit {
  /** Replaces the standard wording of the clause body. */
  text?: string;
  removed?: boolean;
}

export interface CustomClause {
  id: string;
  title: string;
  text: string;
}

/** Everything saved for one contract. */
export interface ContractData {
  fields: ContractFields;
  edits: Record<string, ClauseEdit>;
  custom: CustomClause[];
}

export interface TableRow {
  key: string;
  label: string;
  value: string;
}

export interface BuiltSection {
  id: string;
  /** 0 for the unnumbered signature block. */
  number: number;
  title: string;
  body: string;
  table: TableRow[];
  note: string;
  edited: boolean;
  custom: boolean;
  kind: "clause" | "signature";
}

export interface BuiltContract {
  title: string;
  subtitle: string;
  sections: BuiltSection[];
  /** Clause ids the template defines but this contract dropped. */
  removed: string[];
}

export const DEFAULT_FIELDS: ContractFields = {
  agencyContactName: "Yash",
  agencyContactTitle: "Growth Lead",
  agencyContactEmail: "yash@fidemgrowth.com",
  clientName: "",
  clientRepresents: "",
  clientEmail: "",
  brandName: "",
  productName: "",
  effectiveDate: "",
  campaignName: "",
  creators: [],
  deliverables: "1 dedicated YouTube video",
  productType: "retail",
  creatorShippingAddress: "",
  shippingPaidBy: "client",
  goLiveDate: "",
  usageRights: "tbc",
  usageDays: 30,
  usagePaid: false,
  fee: null,
  currency: "USD",
  depositPercent: 50,
  depositBusinessDays: 7,
  lateFeePercentMonthly: null,
  scriptDays: 7,
  draftDays: 14,
  feedbackBusinessDays: 3,
  revisionRounds: 1,
  deemedAcceptanceOnShipment: true,
  nonCircumventionMonths: 12,
  terminationNoticeDays: 14,
  governingLaw: "",
  fidemSignatoryName: "Yash",
  clientSignatoryName: "",
  creatorCost: null,
};

export function emptyContract(): ContractData {
  return { fields: { ...DEFAULT_FIELDS, creators: [] }, edits: {}, custom: [] };
}

/** Fills in anything missing from an older saved contract, so new fields never crash old ones. */
export function normalizeContract(raw: unknown): ContractData {
  const data = (raw ?? {}) as Partial<ContractData>;
  return {
    fields: { ...DEFAULT_FIELDS, ...(data.fields ?? {}), creators: Array.isArray(data.fields?.creators) ? data.fields!.creators : [] },
    edits: data.edits && typeof data.edits === "object" ? data.edits : {},
    custom: Array.isArray(data.custom) ? data.custom : [],
  };
}

// --- wording helpers ------------------------------------------------------------------------

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberWord(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

/** "seven (7)" — the legal style used throughout the agreement. */
export function counted(n: number): string {
  return `${numberWord(n)} (${n})`;
}

function titleCaseWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function formatContractDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function contractMoney(amount: number | null, currency: string): string {
  if (amount === null || !Number.isFinite(amount)) return "[fee to be confirmed]";
  return `${formatMoney(amount, currency || "USD")} ${currency || "USD"}`.replace(/(\S+) (\S+) \2$/, "$1 $2");
}

function shortUrl(url: string): string {
  return url.trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

export function creatorLine(c: ContractCreator): string {
  const name = c.name.trim() || "Creator";
  const person = c.realName.trim() ? ` (${c.realName.trim()})` : "";
  const url = c.channelUrl.trim() ? ` — ${shortUrl(c.channelUrl)}` : "";
  return `${name}${person}${url}`;
}

const BLANK = "_______________________";

// --- the clauses --------------------------------------------------------------------------

/** ref("disputes") in a body becomes "Clause 15" (or whatever number it has in this contract). */
type Ref = (id: string) => string;

interface ClauseDef {
  id: string;
  title: string;
  /** Protective clauses the analyzer insists on keeping. */
  protective?: boolean;
  body?: (f: ContractFields, ref: Ref, present: (id: string) => boolean) => string;
  table?: (f: ContractFields, ref: Ref) => TableRow[];
  note?: (f: ContractFields) => string;
}

export const CLAUSES: ClauseDef[] = [
  {
    id: "parties",
    title: "Parties",
    table: (f) => [
      { key: "agency", label: "Agency / Vendor", value: 'Fidem Growth ("Fidem"), acting as creator sourcing and campaign management agency' },
      {
        key: "agencyContact",
        label: "Agency Contact",
        value: [f.agencyContactName, f.agencyContactTitle, f.agencyContactEmail].map((s) => s.trim()).filter(Boolean).join(" | ") || BLANK,
      },
      {
        key: "client",
        label: "Client",
        value: f.clientName.trim() ? `${f.clientName.trim()}${f.clientRepresents.trim() ? `, ${f.clientRepresents.trim()}` : ""} ("Client")` : BLANK,
      },
      {
        key: "clientContact",
        label: "Client Contact",
        value: [f.clientName, f.clientEmail].map((s) => s.trim()).filter(Boolean).join(" | ") || BLANK,
      },
      { key: "brand", label: "Brand", value: f.brandName.trim() ? `${f.brandName.trim()}${f.productName.trim() ? ` (${f.productName.trim()})` : ""}` : BLANK },
      { key: "effectiveDate", label: "Effective Date", value: formatContractDate(f.effectiveDate) || BLANK },
    ],
  },
  {
    id: "background",
    title: "Background",
    body: () =>
      'Fidem is a creator-sourcing and campaign-management agency that identifies, vets, and coordinates paid content collaborations between the Client and independent content creators (each, a "Creator") for the purpose of promoting the Client\'s brand and products. Fidem acts as the sole intermediary between the Client and each Creator engaged under this Agreement, and manages outreach, negotiation, briefing, scheduling, quality review, and payment coordination on both sides.',
  },
  {
    id: "scope",
    title: "Scope of Services",
    body: () =>
      'Fidem shall, for each campaign confirmed in writing (including by email) between Fidem and the Client (each, a "Campaign"): (a) source and vet suitable Creators matching the Client\'s stated criteria; (b) negotiate rates and deliverables with selected Creators on the Client\'s behalf; (c) coordinate content briefs, product shipment, and delivery timelines; (d) facilitate draft review and revision cycles between the Client and Creator; and (e) provide performance tracking once content is live, where available. The specific Creators, deliverables, rates, and timeline for each Campaign shall be confirmed separately in writing and shall form part of this Agreement by reference.',
    table: (f, ref) => {
      const rows: TableRow[] = [
        { key: "campaignName", label: "Campaign Name", value: f.campaignName.trim() || BLANK },
        { key: "creators", label: "Selected Creator(s)", value: f.creators.length ? f.creators.map(creatorLine).join("\n") : BLANK },
        { key: "deliverables", label: "Deliverable(s)", value: f.deliverables.trim() || BLANK },
      ];
      if (f.productType === "prototype") {
        rows.push({
          key: "product",
          label: "Product Type & Return",
          value:
            "The unit supplied is a testing prototype, not the final retail version. Following completion of the Campaign, the Client shall collect the unit from the Creator; the Client will arrange and cover the cost of pickup, and the Creator is not responsible for return shipping.",
        });
      } else if (f.productType === "retail") {
        rows.push({
          key: "product",
          label: "Product Type & Return",
          value: "The unit supplied is a final retail unit and may be retained by the Creator following completion of the Campaign.",
        });
      }
      if (f.creatorShippingAddress.trim()) rows.push({ key: "shipping", label: "Shipping Address (Creator)", value: f.creatorShippingAddress.trim() });
      rows.push({
        key: "usage",
        label: "Usage Rights",
        value:
          f.usageRights === "defined"
            ? `Non-exclusive licence for ${f.usagePaid ? "organic and paid" : "organic"} use for ${counted(f.usageDays)} days from first publication (see ${ref("usage")}).`
            : `To be confirmed separately in writing for this Campaign (see ${ref("usage")}).`,
      });
      rows.push({
        key: "rate",
        label: "Agreed Rate",
        value:
          `All-inclusive campaign fee of ${contractMoney(f.fee, f.currency)} payable to Fidem Growth.` +
          (f.productType !== "none" && f.shippingPaidBy === "client"
            ? " The Client (brand) is responsible for arranging and paying all outbound and return shipping of the product directly."
            : ""),
      });
      rows.push({ key: "draftDue", label: "Draft Due", value: `Per Content Review Timeline (${ref("timeline")}) below` });
      rows.push({
        key: "goLive",
        label: "Go-Live Date",
        value: formatContractDate(f.goLiveDate) || `To be coordinated following draft approval, per ${ref("timeline")}`,
      });
      return rows;
    },
    note: (f) =>
      f.deemedAcceptanceOnShipment && f.productType !== "none"
        ? "Note: Once the product has been shipped to the Creator for this Campaign, it is understood that the Client has thereby accepted and agreed to all terms of this Agreement and the Campaign details confirmed above, even where the signature block below has not yet been separately countersigned."
        : "",
  },
  {
    id: "fees",
    title: "Fees & Payment Terms",
    protective: true,
    body: (f) => {
      const deposit = Math.min(100, Math.max(0, Math.round(f.depositPercent)));
      const bullets =
        deposit >= 100
          ? [`• The total Campaign fee is due within ${counted(f.depositBusinessDays)} business days of both parties signing this Agreement or the applicable Campaign confirmation, whichever is later.`]
          : deposit <= 0
            ? ["• The total Campaign fee is due prior to the content going live on the Creator's channel."]
            : [
                `• ${titleCaseWord(numberWord(deposit))} percent (${deposit}%) of the total Campaign fee is due within ${counted(f.depositBusinessDays)} business days of both parties signing this Agreement or the applicable Campaign confirmation, whichever is later.`,
                `• The remaining ${numberWord(100 - deposit)} percent (${100 - deposit}%) of the total Campaign fee is due prior to the content going live on the Creator's channel.`,
              ];
      const late =
        f.lateFeePercentMonthly !== null && f.lateFeePercentMonthly > 0
          ? `Overdue amounts shall accrue a late-payment charge of ${f.lateFeePercentMonthly}% per month (or the maximum permitted by law, if lower) from the due date until paid.`
          : "Late payments may be subject to a reasonable additional charge to cover delay-related costs, to be communicated in advance by Fidem.";
      return [
        "The Client agrees to pay Fidem the agreed rate for each Campaign according to the following schedule, unless a different schedule is separately agreed in writing for a specific Campaign:",
        bullets.join("\n"),
        "Where a Campaign is compensated wholly or partly through product exchange, or where the Client is responsible for shipping under the Campaign table above, the Client shall arrange and bear the cost of shipping the product to the Creator (and, where applicable, its return) within a reasonable time, as coordinated with Fidem. Payment shall be made via bank transfer, PayPal, or such other method as mutually agreed in writing between the parties. Any transaction, currency conversion, or processing fees shall be borne by the Client unless otherwise agreed. Fidem reserves the right to pause production or withhold the go-live approval of any Campaign where payment is not received in accordance with this schedule. " +
          late,
      ].join("\n\n");
    },
  },
  {
    id: "timeline",
    title: "Content Review Timeline & Approval",
    body: (f) =>
      [
        "For the Campaign specified above, the following timeline shall apply, calculated from the date of confirmed product delivery to the Creator:",
        [
          `• Within ${counted(f.scriptDays)} days of receiving the product, the Creator shall provide the written script or content outline to Fidem for the Client's review.`,
          `• Within ${counted(f.draftDays)} days of receiving the product, the Creator shall provide the video draft to Fidem for the Client's review and approval.`,
          "• Following the Client's approval of the draft, Fidem shall coordinate the final publishing date with the Creator.",
        ].join("\n"),
        `The Client shall review and provide feedback on each submission within ${counted(f.feedbackBusinessDays)} business days of receipt. If no feedback is received within this period, the submission shall be deemed approved. ${titleCaseWord(numberWord(f.revisionRounds))} round${f.revisionRounds === 1 ? "" : "s"} of revision limited to factual accuracy (e.g., product specifications, pricing, or features) shall be included in the agreed rate; additional revisions beyond the agreed scope, or requests to alter the Creator's genuine subjective opinion, may incur additional fees or may not be accommodated, consistent with the Creator's editorial independence.`,
      ].join("\n\n"),
  },
  {
    id: "usage",
    title: "Usage Rights",
    body: (f) =>
      `Unless otherwise agreed in writing for a specific Campaign, the Client is granted a non-exclusive license to repost, share, and use the delivered content for ${f.usageRights === "defined" && !f.usagePaid ? "organic" : "organic and paid"} marketing purposes for ${f.usageRights === "defined" ? `a period of ${counted(f.usageDays)} days` : "the period agreed for that Campaign"}, beginning on the date of first publication. Any extended, exclusive, or additional usage rights shall be negotiated separately by Fidem on the Creator's behalf and may incur additional fees.`,
  },
  {
    id: "noncircumvention",
    title: "Non-Circumvention",
    protective: true,
    body: (f) =>
      `In consideration of Fidem's investment in sourcing, vetting, and negotiating with Creators on the Client's behalf, the Client agrees that, for the duration of this Agreement and for a period of ${counted(f.nonCircumventionMonths)} months following its termination or the completion of the last Campaign (whichever is later), the Client shall not directly contact, engage, negotiate with, or enter into any collaboration with any Creator introduced, referred, or shortlisted by Fidem, other than through Fidem, without Fidem's prior written consent. Should the Client engage any such Creator directly in breach of this clause, Fidem shall be entitled to a fee equal to its standard commission on the value of such direct engagement, in addition to any other remedy available at law. This obligation applies regardless of whether a Creator's identity was disclosed to the Client in confirmed or anonymized form.`,
  },
  {
    id: "independent",
    title: "Independent Interactions Disclaimer",
    body: (_f, ref) =>
      `Any communication, contact, or connection that may occur between the Client and a Creator outside the scope of a Campaign formally coordinated through Fidem shall be considered an independent and personal interaction between those parties, unrelated to this Agreement or to Fidem's role as agent. Fidem shall bear no responsibility, obligation, or liability whatsoever arising from or in connection with any such independent interaction, and no rights or obligations under this Agreement shall be deemed to extend to, or arise from, such interaction. Should the Client and a Creator engage independently of Fidem in a manner inconsistent with ${ref("noncircumvention")}, that engagement, and any dispute, obligation, or liability arising from it, shall be deemed dissolved from, and entirely outside of, this Agreement and Fidem's involvement, and Fidem shall have no liability of any kind in connection with it.`,
  },
  {
    id: "contractor",
    title: "Independent Contractor Status",
    body: () =>
      "Fidem acts as an independent agency and is not an employee, partner, joint venturer, or legal representative of the Client. Nothing in this Agreement shall be construed to create an employment, partnership, agency (beyond the limited sourcing and coordination role described herein), or joint venture relationship between the parties.",
  },
  {
    id: "confidentiality",
    title: "Confidentiality",
    protective: true,
    body: () =>
      "Each party agrees to keep confidential any non-public business, pricing, creator, or campaign information disclosed by the other party in connection with this Agreement, and not to disclose such information to any third party without prior written consent, except as required by law. This includes, without limitation, Creator rates, contact details, and media kits shared by Fidem, which shall not be redistributed or used to circumvent this Agreement.",
  },
  {
    id: "liability",
    title: "Limitation of Liability",
    protective: true,
    body: (f) =>
      "Fidem's role is limited to sourcing, coordinating, and facilitating the relationship between the Client and each Creator. Fidem makes no guarantee regarding the performance, views, engagement, sales, or commercial outcome of any Campaign. Fidem's total liability to the Client under this Agreement, whether in contract, tort, or otherwise, shall not exceed the total cash fees actually paid by the Client to Fidem for the specific Campaign giving rise to the claim. In no event shall Fidem be liable for any indirect, incidental, consequential, or punitive damages, including lost profits or lost business opportunity. Fidem shall not be liable for any act, omission, default, delay, or content decision by a Creator, including a Creator's exercise of editorial independence, provided Fidem has used reasonable efforts to source, brief, and coordinate the Creator in accordance with this Agreement." +
      (f.productType === "prototype"
        ? " Fidem shall likewise bear no liability for loss of, or damage to, a prototype or testing unit once it has been collected from the Creator by or on behalf of the Client."
        : ""),
  },
  {
    id: "indemnity",
    title: "Indemnification",
    protective: true,
    body: () =>
      "The Client agrees to indemnify and hold Fidem harmless from any claims, damages, or liabilities arising out of the Client's product, marketing claims, or use of delivered content beyond the scope of the usage rights granted, save to the extent such claims arise from Fidem's own gross negligence or willful misconduct.",
  },
  {
    id: "default",
    title: "Default, Delay & Refunds",
    protective: true,
    body: (f, ref) =>
      "If either the Client or the assigned Creator becomes unable to meet an agreed timeline, the affected party shall promptly notify Fidem in writing, including the reason for the delay and the expected revised timeline, and applicable deadlines shall be extended on a day-for-day basis where the delay is caused by the Client (including delayed product shipment, feedback, or approval). Any advance payment made to Fidem shall be treated as earned upon confirmation of the Campaign and commencement of Fidem's sourcing, coordination, and creator-management services, and shall be non-refundable, save where the assigned Creator fails, without valid cause, to deliver the agreed content in whole. In such an event, the Client shall be entitled to a refund limited to the cash compensation portion actually intended for the Creator and not yet disbursed; Fidem's own management fee and any amounts already disbursed to, or expended in coordinating with, the Creator shall remain non-refundable, as they reflect services already rendered by Fidem. Any product already shipped to a Creator who has begun production in good faith shall not be recoverable by the Client except by separate agreement with the Creator" +
      (f.productType === "prototype" ? `, and — for prototype or testing units — except through the collection process described in ${ref("scope")} above` : "") +
      `. Any dispute regarding delay, quality, or delivery shall first be addressed through good-faith discussion between Fidem and the Client, consistent with ${ref("disputes")} (Dispute Resolution) below.`,
  },
  {
    id: "term",
    title: "Term & Termination",
    body: (f, ref, present) => {
      const survivors = ["noncircumvention", "independent", "contractor", "confidentiality", "liability", "indemnity", "default"].filter(present);
      const numbers = survivors.map((id) => ref(id).replace(/^Clause /, ""));
      const list = numbers.length > 1 ? `${numbers.slice(0, -1).join(", ")}, and ${numbers[numbers.length - 1]}` : numbers[0];
      return (
        `This Agreement shall commence on the Effective Date and continue until terminated by either party with ${counted(f.terminationNoticeDays)} days' written notice. Termination of this Agreement shall not affect the completion of any Campaign already confirmed and in progress, nor any payment obligations already accrued` +
        (numbers.length ? `, nor shall it affect the survival of Clause${numbers.length === 1 ? "" : "s"} ${list}, which shall continue in force in accordance with their terms.` : ".")
      );
    },
  },
  {
    id: "disputes",
    title: "Dispute Resolution & Governing Law",
    protective: true,
    body: (f) =>
      f.governingLaw.trim()
        ? `This Agreement shall be governed by and construed in accordance with the laws of ${f.governingLaw.trim()}. Any dispute, disagreement, or claim arising out of or relating to this Agreement shall first be addressed through prompt, good-faith discussion between Fidem and the Client. Should the parties be unable to resolve a dispute within thirty (30) days of written notice of the dispute, either party may refer it to the competent courts of ${f.governingLaw.trim()}, to whose jurisdiction both parties submit. Nothing in this clause shall prevent either party from seeking urgent interim relief where reasonably necessary to prevent immediate and irreparable harm.`
        : "As the governing jurisdiction for this Agreement has not yet been formally designated, the parties agree that any dispute, disagreement, or claim arising out of or relating to this Agreement shall first be addressed through prompt, good-faith, and mutually respectful discussion between Fidem and the Client, with each party acting reasonably and in the spirit of the ongoing business relationship. Should the parties be unable to resolve a dispute through good-faith negotiation within a reasonable period, the parties shall mutually agree upon an appropriate forum, jurisdiction, and resolution mechanism (which may include mediation, arbitration, or another mutually acceptable process) at that time. Nothing in this clause shall prevent either party from seeking urgent interim relief where reasonably necessary to prevent immediate and irreparable harm.",
  },
  {
    id: "entire",
    title: "Entire Agreement",
    body: (f, ref) =>
      "This Agreement, together with any Campaign confirmations issued in writing (including by email), constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior discussions and understandings, whether written or oral. Any amendment to this Agreement must be made in writing and signed by both parties" +
      (f.deemedAcceptanceOnShipment && f.productType !== "none" ? `, save for the deemed-acceptance effect of product shipment described in ${ref("scope")} above.` : "."),
  },
];

export const CLAUSE_IDS = CLAUSES.map((c) => c.id);
export const PROTECTIVE_CLAUSES = new Set(CLAUSES.filter((c) => c.protective).map((c) => c.id));

export function clauseTitle(id: string): string {
  return CLAUSES.find((c) => c.id === id)?.title ?? id;
}

/** The standard wording of one clause's body for these fields (before any edit). */
export function standardBody(id: string, data: ContractData): string {
  const { ref, present } = numbering(data);
  const def = CLAUSES.find((c) => c.id === id);
  return def?.body ? def.body(data.fields, ref, present) : "";
}

// Custom clauses go in before "Entire Agreement", which conventionally stays last.
function orderedIds(data: ContractData): { id: string; custom: CustomClause | null }[] {
  const out: { id: string; custom: CustomClause | null }[] = [];
  for (const c of CLAUSES) {
    if (c.id === "entire") for (const cc of data.custom) out.push({ id: cc.id, custom: cc });
    out.push({ id: c.id, custom: null });
  }
  return out;
}

function numbering(data: ContractData) {
  const numbers = new Map<string, number>();
  let n = 0;
  for (const { id } of orderedIds(data)) {
    if (data.edits[id]?.removed) continue;
    numbers.set(id, ++n);
  }
  const ref: Ref = (id) => (numbers.has(id) ? `Clause ${numbers.get(id)}` : `[removed clause: ${clauseTitle(id)}]`);
  const present = (id: string) => numbers.has(id);
  return { numbers, ref, present };
}

export function buildContract(data: ContractData): BuiltContract {
  const f = data.fields;
  const { numbers, ref, present } = numbering(data);
  const sections: BuiltSection[] = [];

  for (const { id, custom } of orderedIds(data)) {
    if (!numbers.has(id)) continue;
    if (custom) {
      sections.push({ id, number: numbers.get(id)!, title: custom.title.trim() || "Additional Terms", body: custom.text, table: [], note: "", edited: true, custom: true, kind: "clause" });
      continue;
    }
    const def = CLAUSES.find((c) => c.id === id)!;
    const edit = data.edits[id];
    const standard = def.body ? def.body(f, ref, present) : "";
    const body = edit?.text !== undefined && def.body ? edit.text : standard;
    sections.push({
      id,
      number: numbers.get(id)!,
      title: def.title,
      body,
      table: def.table ? def.table(f, ref) : [],
      note: def.note ? def.note(f) : "",
      edited: edit?.text !== undefined && edit.text.trim() !== standard.trim(),
      custom: false,
      kind: "clause",
    });
  }

  const clientParty = [f.clientName.trim(), f.brandName.trim()].filter(Boolean).join(" / ") || "the Client";
  sections.push({
    id: "signatures",
    number: 0,
    title: "Signatures",
    body: "",
    table: [
      { key: "fidemSignature", label: "For Fidem Growth", value: `Signature: ${BLANK}\nName: ${f.fidemSignatoryName.trim()}\nDate:` },
      { key: "clientSignature", label: `For the Client (${clientParty})`, value: `Signature: ${BLANK}\nName: ${f.clientSignatoryName.trim()}\nDate:` },
    ],
    note: "",
    edited: false,
    custom: false,
    kind: "signature",
  });

  const who = f.clientName.trim() ? `${f.clientName.trim()}${f.brandName.trim() ? ` (on behalf of ${f.brandName.trim()})` : ""}` : f.brandName.trim() || "Client";
  return {
    title: "CLIENT SERVICES AGREEMENT",
    subtitle: `Fidem Growth × ${who}`,
    sections,
    removed: CLAUSE_IDS.filter((id) => !numbers.has(id)),
  };
}

/** The whole contract as plain text — for the AI review, search, and the "copy text" button. */
export function contractPlainText(built: BuiltContract): string {
  const parts = [built.title, built.subtitle, ""];
  for (const s of built.sections) {
    parts.push(s.number ? `${s.number}. ${s.title}` : s.title);
    if (s.body) parts.push(s.body);
    for (const r of s.table) parts.push(`${r.label}: ${r.value}`);
    if (s.note) parts.push(s.note);
    parts.push("");
  }
  return parts.join("\n");
}

/** A readable file name for the exported PDF: "Fidem_x_SEVVS_Shopping_with_Amy_Agreement". */
export function contractFileName(f: ContractFields): string {
  const clean = (s: string) => s.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const parts = ["Fidem_x", clean(f.brandName) || "Client", ...f.creators.slice(0, 2).map((c) => clean(c.name)).filter(Boolean), "Agreement"];
  return parts.join("_").replace(/_+/g, "_");
}
