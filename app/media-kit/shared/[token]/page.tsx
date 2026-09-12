import { Suspense } from "react";
import SharedMediaKitView from "./SharedMediaKitView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Media Kit — Fidem Growth",
  // Shared with one brand by link; not something to appear in search results.
  robots: { index: false, follow: false },
};

/**
 * The no-login view of a shared channel media kit.
 *
 * Deliberately outside the (app) route group, same reasoning as app/insights/shared/[token]:
 * that group renders the CRM shell, which a brand opening a link should never see and has no
 * session to use anyway.
 */
export default async function SharedMediaKitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense fallback={null}>
      <SharedMediaKitView token={token} />
    </Suspense>
  );
}
