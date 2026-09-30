import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The address brand-facing pages tell a brand to write to: PUBLIC_CONTACT_EMAIL when set, otherwise
 * the team's connected outreach inbox — the one brands already have a thread with.
 */
export async function publicContactEmail(): Promise<string | null> {
  const configured = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  if (configured) return configured;
  const account = await prisma.emailAccount.findFirst({
    where: { accessStatus: "CONNECTED" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return account?.email ?? null;
}
