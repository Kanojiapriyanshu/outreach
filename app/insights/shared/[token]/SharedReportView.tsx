"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import YoutubeInsightReport from "@/app/(app)/insights/YoutubeInsightReport";

/**
 * Renders a shared report for someone with the link and no account.
 *
 * Reuses the same report component the team sees internally, so a brand is looking at exactly what
 * was generated rather than a separately-maintained "client version" that can drift out of sync.
 */
export default function SharedReportView({ token }: { token: string }) {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/insights/public/${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok || payload.success === false) {
          throw new Error(payload.message || "This link is no longer available.");
        }
        const data = payload.data ?? {};
        if (!cancelled) setReport(data.frontendReport ?? data.dashboard ?? data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "This link is no longer available.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading report…
        </p>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">Report unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {error || "This link is no longer available."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <YoutubeInsightReport report={report} />
    </main>
  );
}
