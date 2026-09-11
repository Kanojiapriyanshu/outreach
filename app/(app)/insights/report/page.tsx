import { Suspense } from "react";
import InsightReportClient from "../InsightReportClient";

export const dynamic = "force-dynamic";

function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-[var(--muted)]">Preparing the report…</p>
    </div>
  );
}

export default function InsightReportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <InsightReportClient />
    </Suspense>
  );
}
