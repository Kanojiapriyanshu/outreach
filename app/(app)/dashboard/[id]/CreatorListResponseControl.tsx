"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreatorListResponseControl({
  sequenceId,
  respondedAt,
}: {
  sequenceId: string;
  respondedAt: string | null; // ISO string, or null if no response yet
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const responded = !!respondedAt;

  async function setReceived(received: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/creator-list-response`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ received }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't update — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
      <span
        className="badge inline-flex items-center gap-1.5 w-fit"
        style={
          responded
            ? { background: "var(--success-bg)", color: "var(--success-fg)" }
            : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
        }
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: responded ? "var(--success-fg)" : "var(--muted-2)" }}
        />
        {responded ? `Response Received — ${new Date(respondedAt!).toLocaleString()}` : "Awaiting Response"}
      </span>
      <button
        type="button"
        className="btn-secondary text-xs py-1.5 px-3 w-fit"
        disabled={loading}
        onClick={() => setReceived(!responded)}
      >
        {responded ? "Undo" : "Mark Response Received"}
      </button>
      {error && (
        <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
