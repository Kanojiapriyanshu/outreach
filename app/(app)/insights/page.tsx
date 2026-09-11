import { Suspense } from "react";
import InsightOsAnalyzePage from "./InsightOsAnalyzePage";

// Reads search params and its own report list — never a build-time snapshot.
export const dynamic = "force-dynamic";

export default function InsightsPage() {
  return (
    <Suspense fallback={null}>
      {/* `public` is the standalone variant: paste a link, get a report. The alternative "brand"
          mode belongs to the old app's campaign picker, which has no counterpart here. */}
      <InsightOsAnalyzePage mode="public" />
    </Suspense>
  );
}
