"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ChannelMediaKitView, { type ChannelMediaKitData } from "../../ChannelMediaKitView";

/**
 * The no-login view of a shared channel media kit — same pattern as Insight OS's
 * SharedReportView.tsx: a bare fetch-and-render, no CRM chrome, since whoever opens this link
 * (a brand) has no session here and shouldn't see the internal app around it.
 */
export default function SharedMediaKitView({ token }: { token: string }) {
  const [kit, setKit] = useState<ChannelMediaKitData | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/media-kit/public/${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "This link is no longer available.");
        if (!cancelled) setKit(payload.mediaKit.data as ChannelMediaKitData);
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
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading media kit…
        </p>
      </main>
    );
  }

  if (error || !kit) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">Media kit unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error || "This link is no longer available."}</p>
        </div>
      </main>
    );
  }

  return <ChannelMediaKitView kit={kit} />;
}
