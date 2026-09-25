import { describe, it, expect } from "vitest";
import { buildContract, contractFileName, contractPlainText, counted, emptyContract, normalizeContract, standardBody, type ContractData } from "../contracts/template";
import { changeSummary, diffContracts, wordDiff } from "../contracts/diff";
import { addBusinessDays, analyzeContract, dealSummary } from "../contracts/analyze";

/** The Fidem × SEVVS / Shopping with Amy agreement, as fields. */
function sevvs(): ContractData {
  const data = emptyContract();
  Object.assign(data.fields, {
    clientName: "Summer Wen",
    clientRepresents: "on behalf of her agency and SEVVS",
    clientEmail: "amilialice126@gmail.com",
    brandName: "SEVVS",
    productName: "Smart Brewmaster S1",
    campaignName: "SEVVS Smart Brewmaster S1 — Dedicated YouTube Video",
    creators: [{ name: "Shopping with Amy", realName: "Amanda Ignash", channelUrl: "https://youtube.com/@shoppingwithamy" }],
    deliverables: "1 dedicated YouTube video featuring the SEVVS Smart Brewmaster S1",
    productType: "prototype",
    creatorShippingAddress: "Amanda Ignash, 10026 Kenda Dr., Riverview, Florida 33578",
    fee: 2800,
    currency: "USD",
  });
  return data;
}

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("contract template", () => {
  it("reproduces the SEVVS agreement's wording", () => {
    const built = buildContract(sevvs());
    const text = flat(contractPlainText(built));
    expect(built.subtitle).toBe("Fidem Growth × Summer Wen (on behalf of SEVVS)");
    expect(built.sections.filter((s) => s.kind === "clause")).toHaveLength(16);
    for (const line of [
      'Client: Summer Wen, on behalf of her agency and SEVVS ("Client")',
      "Brand: SEVVS (Smart Brewmaster S1)",
      "Selected Creator(s): Shopping with Amy (Amanda Ignash) — youtube.com/@shoppingwithamy",
      "Usage Rights: To be confirmed separately in writing for this Campaign (see Clause 6).",
      "Agreed Rate: All-inclusive campaign fee of $2,800 USD payable to Fidem Growth. The Client (brand) is responsible for arranging and paying all outbound and return shipping of the product directly.",
      "Draft Due: Per Content Review Timeline (Clause 5) below",
      "Fifty percent (50%) of the total Campaign fee is due within seven (7) business days of both parties signing",
      "The remaining fifty percent (50%) of the total Campaign fee is due prior to the content going live",
      "Within fourteen (14) days of receiving the product, the Creator shall provide the video draft",
      "within three (3) business days of receipt",
      "One round of revision limited to factual accuracy",
      "for a period of twelve (12) months following its termination",
      "in a manner inconsistent with Clause 7, that engagement",
      "once it has been collected from the Creator by or on behalf of the Client.",
      "except through the collection process described in Clause 3 above",
      "consistent with Clause 15 (Dispute Resolution) below.",
      "with fourteen (14) days' written notice",
      "the survival of Clauses 7, 8, 9, 10, 11, 12, and 13, which shall continue in force",
      "save for the deemed-acceptance effect of product shipment described in Clause 3 above.",
    ]) {
      expect(text).toContain(flat(line));
    }
  });

  it("renumbers clauses and cross-references when one is removed", () => {
    const data = sevvs();
    data.edits.contractor = { removed: true };
    const text = flat(contractPlainText(buildContract(data)));
    expect(text).toContain("14. Dispute Resolution & Governing Law");
    expect(text).toContain("consistent with Clause 14 (Dispute Resolution)");
    expect(text).toContain("the survival of Clauses 7, 8, 9, 10, 11, and 12,");
  });

  it("puts custom clauses before Entire Agreement", () => {
    const data = sevvs();
    data.custom.push({ id: "custom-1", title: "Exclusivity", text: "The Creator shall not promote a competing coffee machine for 30 days." });
    const titles = buildContract(data).sections.map((s) => `${s.number}. ${s.title}`);
    expect(titles).toContain("16. Exclusivity");
    expect(titles).toContain("17. Entire Agreement");
  });

  it("flags an edited clause and keeps fields out of it", () => {
    const data = sevvs();
    data.edits.usage = { text: standardBody("usage", data).replace("a non-exclusive", "an exclusive") };
    const usage = buildContract(data).sections.find((s) => s.id === "usage")!;
    expect(usage.edited).toBe(true);
    expect(usage.body).toContain("an exclusive license");
  });

  it("switches wording with the fields", () => {
    const data = sevvs();
    Object.assign(data.fields, { depositPercent: 30, governingLaw: "the State of New York, USA", usageRights: "defined", usageDays: 90, usagePaid: true, lateFeePercentMonthly: 1.5 });
    const text = flat(contractPlainText(buildContract(data)));
    expect(text).toContain("Thirty percent (30%) of the total Campaign fee");
    expect(text).toContain("The remaining seventy percent (70%)");
    expect(text).toContain("governed by and construed in accordance with the laws of the State of New York, USA");
    expect(text).toContain("organic and paid use for ninety (90) days from first publication");
    expect(text).toContain("a late-payment charge of 1.5% per month");
  });

  it("survives old saved data and names the PDF", () => {
    expect(normalizeContract({ fields: { brandName: "X" } }).fields.depositPercent).toBe(50);
    expect(contractFileName(sevvs().fields)).toBe("Fidem_x_SEVVS_Shopping_with_Amy_Agreement");
    expect(counted(21)).toBe("twenty-one (21)");
  });
});

describe("tracked changes", () => {
  it("marks only the words that changed", () => {
    const segments = wordDiff("due within seven (7) business days", "due within ten (10) business days");
    expect(segments.filter((s) => s.kind === "removed").map((s) => s.text.trim())).toEqual(["seven (7)"]);
    expect(segments.filter((s) => s.kind === "added").map((s) => s.text.trim())).toEqual(["ten (10)"]);
  });

  it("summarises what changed against the standard template", () => {
    const base = buildContract(sevvs());
    const data = sevvs();
    data.fields.fee = 3200;
    data.edits.contractor = { removed: true };
    const diff = diffContracts(base, buildContract(data));
    const summary = changeSummary(diff);
    expect(summary.find((s) => s.id === "contractor")?.status).toBe("removed");
    expect(summary.find((s) => s.id === "scope")?.status).toBe("changed");
    expect(diff.find((s) => s.id === "disputes")?.renumberedFrom).toBe(15);
    expect(summary.some((s) => s.id === "background")).toBe(false);
  });
});

describe("deal check", () => {
  const today = new Date("2026-09-25T10:00:00Z");

  it("works out the money and dates", () => {
    const f = { ...sevvs().fields, effectiveDate: "2026-09-25", creatorCost: 1800 };
    const d = dealSummary(f);
    expect(d.deposit).toBe(1400);
    expect(d.balance).toBe(1400);
    expect(d.depositDueBy).toBe("2026-10-06");
    expect(d.margin).toBe(1000);
    expect(addBusinessDays("2026-09-25", 1)).toBe("2026-09-28");
  });

  it("finds the SEVVS agreement's real gaps", () => {
    const ids = analyzeContract(sevvs(), undefined, today).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["usage-undefined", "governing-law", "creator-identity", "free-mail", "effective-date", "late-fee"]));
    expect(ids.some((id) => ["client-name", "fee", "creators", "client-email"].includes(id))).toBe(false);
  });

  it("blocks removing protection and warns when the deposit doesn't cover the creator", () => {
    const data = sevvs();
    data.edits.noncircumvention = { removed: true };
    data.fields.creatorCost = 2000;
    const findings = analyzeContract(data, undefined, today);
    expect(findings.find((f) => f.id === "removed-noncircumvention")?.severity).toBe("blocker");
    const deposit = findings.find((f) => f.id === "deposit-vs-creator");
    expect(deposit?.fix?.fields?.depositPercent).toBe(75);
  });

  it("catches an edited clause citing a clause that doesn't exist", () => {
    const data = sevvs();
    data.edits.independent = { text: "Anything inconsistent with Clause 21 is outside this Agreement." };
    expect(analyzeContract(data, undefined, today).some((f) => f.id.startsWith("ref-independent"))).toBe(true);
  });
});
