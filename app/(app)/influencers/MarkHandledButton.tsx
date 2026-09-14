"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

/** Clears the "needs your reply" highlight for a reply handled outside this thread. */
export default function MarkHandledButton({ sequenceId, compact = false }: { sequenceId: string; compact?: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markHandled() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/handled`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't update — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={markHandled}
        disabled={saving}
        title="You've dealt with this reply somewhere else — clear the highlight"
        className={`btn-secondary inline-flex items-center gap-1 whitespace-nowrap ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}
      >
        <Check size={compact ? 12 : 14} /> {saving ? "Saving…" : "Mark handled"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
