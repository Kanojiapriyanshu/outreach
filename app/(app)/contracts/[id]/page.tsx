import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeContract } from "@/lib/contracts/template";
import ContractEditor from "./ContractEditor";

export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, label: true, createdAt: true, data: true } } },
  });
  if (!contract) notFound();

  return (
    <ContractEditor
      id={contract.id}
      initialTitle={contract.title}
      initialStatus={contract.status}
      initialData={normalizeContract(contract.data)}
      initialVersions={contract.versions.map((v) => ({ id: v.id, label: v.label, createdAt: v.createdAt.toISOString(), data: v.data }))}
      aiAvailable={!!process.env.ANTHROPIC_API_KEY}
    />
  );
}
