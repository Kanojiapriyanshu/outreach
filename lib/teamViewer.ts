import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Whether the person opening a brand-facing page is logged in to the app — i.e. the team checking
 * what a brand will see. Their visits aren't counted as the brand opening the link.
 */
export async function isTeamViewer(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    return (await verifySessionToken(token)) !== null;
  } catch {
    return false;
  }
}
