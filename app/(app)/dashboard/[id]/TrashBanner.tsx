"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw } from "lucide-react";
import { formatDateTime } from "@/lib/formatDate";

export default function TrashBanner({ sequenceId, deletedAt }: { sequenceId: string; deletedAt: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"restore" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingPermanent, setConfirmingPermanent] = useState(false);

  async function restore() {
    setLoading("restore");
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/restore`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't restore — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore — try again.");
    } finally {
      setLoading(null);
    }
  }

  async function deleteForever() {
    setLoading("delete");
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/permanent`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't delete — try again.");
      router.push("/trash");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete — try again.");
      setLoading(null);
      setConfirmingPermanent(false);
    }
  }

  return (
    <div className="card p-4" style={{ borderColor: "var(--danger-fg)", background: "var(--danger-bg)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--danger-fg)" }}>
          <Trash2 size={15} />
          <span>
            In Trash since {formatDateTime(new Date(deletedAt))} — follow-ups are paused. Restore it, or delete it for
            good.
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={restore} disabled={loading !== null} className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5">
            <RotateCcw size={13} /> {loading === "restore" ? "Restoring…" : "Restore"}
          </button>
          <button onClick={() => setConfirmingPermanent(true)} disabled={loading !== null} className="btn-danger px-3 py-1.5 text-xs">
            Delete Forever
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--danger-fg)" }}>
          {error}
        </p>
      )}

      {confirmingPermanent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.5)" }}
          onClick={() => loading === null && setConfirmingPermanent(false)}
        >
          <div className="card p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-[var(--ink)] mb-2">Delete this for good?</h3>
            <p className="text-sm text-[var(--muted)] mb-4">
              This removes its entire tracked history from Fidem Growth permanently — there&rsquo;s no more Trash after
              this. Nothing in Gmail itself is touched.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmingPermanent(false)} disabled={loading !== null} className="btn-secondary px-4 py-2 text-sm">
                Cancel
              </button>
              <button onClick={deleteForever} disabled={loading !== null} className="btn-danger px-4 py-2 text-sm">
                {loading === "delete" ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
