import { Suspense } from "react";
import SharedReportView from "./SharedReportView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Creator Insight Report — Fidem Growth",
  // Shared with one brand by link; not something to appear in search results.
  robots: { index: false, follow: false },
};

/**
 * The no-login view of a shared report.
 *
 * Deliberately outside the (app) route group: that group renders the CRM shell with the inbox and
 * pipeline nav, which a brand opening a link should never see — and has no session to use anyway.
 */
export default async function SharedInsightPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense fallback={null}>
      <SharedReportView token={token} />
    </Suspense>
  );
}
