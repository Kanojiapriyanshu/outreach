import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { buildContract, formatContractDate, normalizeContract } from "@/lib/contracts/template";
import { analyzeContract, dealSummary } from "@/lib/contracts/analyze";
import { AiReviewUnavailable, reviewContractWithAi } from "@/lib/contracts/aiReview";

export const maxDuration = 120;

/** AI review of the saved contract — on demand only, since it costs a model call. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({ where: { id }, select: { data: true } });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const data = normalizeContract(contract.data);
  const built = buildContract(data);
  const deal = dealSummary(data.fields);
  const money = (n: number | null) => (n === null ? "not set" : formatMoney(n, deal.currency));

  // Tag clauses that differ from Fidem's standard so the review looks hardest at them.
  const text = [built.title, built.subtitle, ""]
    .concat(
      built.sections.flatMap((s) => [
        `${s.number ? `${s.number}. ` : ""}${s.title}${s.custom ? " [CUSTOM]" : s.edited ? " [EDITED]" : ""}`,
        s.body,
        ...s.table.map((r) => `${r.label}: ${r.value}`),
        s.note,
        "",
      ])
    )
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  const summary = [
    `Fee: ${money(deal.fee)} (${deal.currency})`,
    `Deposit: ${data.fields.depositPercent}% = ${money(deal.deposit)}, due ${data.fields.depositBusinessDays} business days after signing${deal.depositDueBy ? ` (${formatContractDate(deal.depositDueBy)})` : ""}`,
    `Balance: ${money(deal.balance)} before go-live`,
    `Fidem pays the creator(s): ${data.fields.creatorCost === null ? "not entered" : money(data.fields.creatorCost)} (internal, not in the contract)`,
    `Removed standard clauses: ${built.removed.length ? built.removed.join(", ") : "none"}`,
  ].join("\n");

  const known = analyzeContract(data, built).map((f) => `- [${f.severity}] ${f.title}`);

  try {
    const review = await reviewContractWithAi({ contractText: text, dealSummary: summary, knownFindings: known });
    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof AiReviewUnavailable) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI review failed" }, { status: 502 });
  }
}
