import { notFound } from "next/navigation";
import ContractPrintLayout from "@/app/components/contracts/ContractPrintLayout";
import { prisma } from "@/lib/prisma";
import { buildContract, contractFileName, normalizeContract } from "@/lib/contracts/template";
import { diffContracts } from "@/lib/contracts/diff";
import PrintToolbar from "./PrintToolbar";

export const dynamic = "force-dynamic";

export const metadata = { robots: { index: false, follow: false } };

/**
 * The printable agreement, opened in its own tab by the editor's Export button. Outside the (app)
 * group so there's no CRM chrome on the page — still behind the login (it isn't a public path).
 *
 * ?compare=standard | <versionId> prints a redline marked against that base instead of the clean
 * copy — for sending a brand "here's what we changed".
 */
export default async function ContractPdfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ compare?: string }> }) {
  const { id } = await params;
  const { compare } = await searchParams;
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();

  const data = normalizeContract(contract.data);
  const built = buildContract(data);

  let diff = null;
  let compareLabel = "";
  if (compare === "standard") {
    diff = diffContracts(buildContract({ ...data, edits: {}, custom: [] }), built);
    compareLabel = "Changes from Fidem's standard agreement";
  } else if (compare) {
    const version = await prisma.contractVersion.findFirst({ where: { id: compare, contractId: id } });
    if (version) {
      diff = diffContracts(buildContract(normalizeContract(version.data)), built);
      compareLabel = `Changes since “${version.label}” (${version.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
    }
  }

  const fileName = contractFileName(data.fields) + (diff ? "_Redline" : "");

  return (
    <>
      <PrintToolbar fileName={fileName} compareLabel={compareLabel} />
      <ContractPrintLayout built={built} diff={diff} compareLabel={compareLabel} />
    </>
  );
}
