"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelScheduledEmail({ scheduledEmailId }: { scheduledEmailId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-emails/${scheduledEmailId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't cancel — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel — try again.");
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-[var(--muted)]">Cancel this send?</span>
        <button onClick={cancel} disabled={loading} className="btn-danger px-2.5 py-1 text-xs">
          {loading ? "…" : "Yes, cancel"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={loading} className="btn-secondary px-2.5 py-1 text-xs">
          Never mind
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={() => setConfirming(true)} className="btn-secondary px-3 py-1.5 text-xs">
        Cancel
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
