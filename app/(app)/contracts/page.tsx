import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/creatorReplyAnalysis";
import { buildContract, normalizeContract } from "@/lib/contracts/template";
import { analyzeContract } from "@/lib/contracts/analyze";
import NewContractButton from "./NewContractButton";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  DRAFT: { label: "Draft", bg: "var(--neutral-bg)", fg: "var(--neutral-fg)" },
  SENT: { label: "Sent to brand", bg: "var(--info-bg)", fg: "var(--info-fg)" },
  SIGNED: { label: "Signed", bg: "var(--success-bg)", fg: "var(--success-fg)" },
  VOID: { label: "Void", bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
};

function when(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ContractsPage() {
  const contracts = await prisma.contract.findMany({ orderBy: { updatedAt: "desc" }, take: 200 });
  const rows = contracts.map((c) => {
    const data = normalizeContract(c.data);
    const findings = analyzeContract(data, buildContract(data));
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      updatedAt: c.updatedAt,
      brand: data.fields.brandName,
      creators: data.fields.creators.map((x) => x.name).filter(Boolean).join(", "),
      fee: data.fields.fee !== null ? formatMoney(data.fields.fee, data.fields.currency) : "—",
      blockers: findings.filter((f) => f.severity === "blocker").length,
      risks: findings.filter((f) => f.severity === "risk").length,
    };
  });

  const open = rows.filter((r) => r.status === "SENT");
  const openValue = open.reduce((sum, r) => sum + (normalizeContract(contracts.find((c) => c.id === r.id)!.data).fields.fee ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--ink)]">Contracts</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Client services agreements built from your standard terms — edit, check the deal, and export the PDF for the brand.
          </p>
        </div>
        <NewContractButton />
      </div>

      {open.length > 0 && (
        <p className="text-sm rounded-lg px-4 py-2.5" style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}>
          {open.length} agreement{open.length === 1 ? "" : "s"} with brands awaiting signature
          {openValue > 0 ? ` · ${formatMoney(openValue, "USD")} in fees` : ""}.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card px-5 py-14 text-center text-sm text-[var(--muted-2)]">No contracts yet. Start one from your standard agreement.</div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-[var(--muted)] text-left">
              <tr className="border-b border-[var(--border)]">
                {["Agreement", "Brand", "Fee", "Status", "Deal check", "Updated"].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)]">
                  <td className="px-4 py-3">
                    <Link href={`/contracts/${r.id}`} className="font-medium text-[var(--ink)] hover:underline">
                      {r.title}
                    </Link>
                    {r.creators && <div className="text-xs text-[var(--muted-2)] truncate max-w-[280px]">{r.creators}</div>}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink)]">{r.brand || "—"}</td>
                  <td className="px-4 py-3 text-[var(--ink)]">{r.fee}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: STATUS[r.status]?.bg, color: STATUS[r.status]?.fg }}>
                      {STATUS[r.status]?.label ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.blockers > 0 ? (
                      <span style={{ color: "var(--danger-fg)" }}>
                        {r.blockers} to fix{r.risks ? ` · ${r.risks} risk${r.risks === 1 ? "" : "s"}` : ""}
                      </span>
                    ) : r.risks > 0 ? (
                      <span style={{ color: "var(--warn-fg)" }}>
                        {r.risks} risk{r.risks === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span style={{ color: "var(--success-fg)" }}>Clear</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted-2)]">{when(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
