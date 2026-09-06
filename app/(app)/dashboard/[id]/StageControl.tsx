"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MANUAL_STAGES = [
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "CREATOR_SELECTED", label: "Creator Selected" },
  { value: "DEAL", label: "Deal" },
];

export default function StageControl({ sequenceId, stage }: { sequenceId: string; stage: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManuallySet = MANUAL_STAGES.some((s) => s.value === stage);

  async function setStage(value: string) {
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't update the stage — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the stage — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-[var(--muted)]">Set stage:</label>
      <select
        className="input py-1.5 text-xs w-auto"
        value={isManuallySet ? stage : ""}
        disabled={loading}
        onChange={(e) => setStage(e.target.value)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {MANUAL_STAGES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs" style={{ color: "var(--danger-fg)" }}>{error}</p>}
    </div>
  );
}
