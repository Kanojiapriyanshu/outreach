"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

export default function TrashRowActions({ sequenceId }: { sequenceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"restore" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setLoading("restore");
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/restore`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't restore — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore — try again.");
      setLoading(null);
    }
  }

  async function deleteForever() {
    setLoading("delete");
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/permanent`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't delete — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete — try again.");
      setLoading(null);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-[var(--muted)]">Delete for good?</span>
        <button onClick={deleteForever} disabled={loading !== null} className="btn-danger px-2.5 py-1 text-xs">
          {loading === "delete" ? "…" : "Yes, delete"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={loading !== null} className="btn-secondary px-2.5 py-1 text-xs">
          Never mind
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2 justify-end">
        <button onClick={restore} disabled={loading !== null} className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5">
          <RotateCcw size={12} /> {loading === "restore" ? "…" : "Restore"}
        </button>
        <button onClick={() => setConfirming(true)} disabled={loading !== null} className="btn-danger px-3 py-1.5 text-xs">
          Delete Forever
        </button>
      </div>
      {error && (
        <span className="text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
