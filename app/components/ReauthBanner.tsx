import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Shown on every page while a Gmail inbox needs reconnecting. Google stops honouring a saved
 * sign-in when it expires or is revoked, and from then on nothing sends from that inbox — follow-ups
 * pile up quietly unless someone happens to open Settings. This makes it impossible to miss.
 */
export default async function ReauthBanner() {
  // Read the inbox status on every request. Without this, pages Next.js prerenders at build time
  // (Settings, Templates…) froze whatever the status was during the build — so the banner kept
  // saying "on hold" after the inbox had been reconnected.
  await connection();
  const accounts = await prisma.emailAccount.findMany({
    where: { accessStatus: "NEEDS_REAUTH" },
    select: { email: true },
  });
  if (accounts.length === 0) return null;

  return (
    <div
      className="mb-5 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between text-sm"
      style={{ background: "var(--danger-bg)", color: "var(--danger-fg)" }}
      role="alert"
    >
      <span>
        <strong>Emails are on hold.</strong> Google sign-in for {accounts.map((a) => a.email).join(", ")} has expired —
        no follow-ups or scheduled emails can go out from {accounts.length === 1 ? "it" : "them"} until you reconnect.
        Everything waiting will send once it&apos;s reconnected.
      </span>
      <a href="/api/auth/google" className="btn-primary px-4 py-2 text-sm whitespace-nowrap text-center">
        Reconnect Gmail
      </a>
    </div>
  );
}
