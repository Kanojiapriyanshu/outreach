"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";

/** "YYYY-MM-DDTHH:mm" in the browser's own local time — what <input type="datetime-local">
 * needs, matching the same pattern used for follow-up rescheduling. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Gmail-style controls for one scheduled Email 1: Reschedule (edit the time in place, or reopen
 * a cancelled/failed one as pending with a new time), Cancel (stop it without losing it), and
 * Delete (remove it from the list for good). Which buttons show depends on status. */
export default function ScheduledEmailActions({
  scheduledEmailId,
  status,
  scheduledAt,
}: {
  scheduledEmailId: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
  scheduledAt: string;
}) {
  const router = useRouter();
  const [rescheduling, setRescheduling] = useState(false);
  const [dateDraft, setDateDraft] = useState(() => toLocalInputValue(scheduledAt));
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitReschedule() {
    if (!dateDraft) return;
    setLoading(true);
    setError(null);
    try {
      const iso = new Date(dateDraft).toISOString();
      const res = await fetch(`/api/scheduled-emails/${scheduledEmailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: iso }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't reschedule — try again.");
      setRescheduling(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reschedule — try again.");
    } finally {
      setLoading(false);
    }
  }

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
      setConfirmingCancel(false);
    }
  }

  async function deleteForever() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/scheduled-emails/${scheduledEmailId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't delete — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete — try again.");
      setLoading(false);
      setConfirmingDelete(false);
    }
  }

  if (rescheduling) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5 justify-end">
          <input
            type="datetime-local"
            className="input py-1 text-xs"
            style={{ minWidth: 0 }}
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
          />
          <button onClick={submitReschedule} disabled={loading || !dateDraft} className="btn-primary px-2.5 py-1 text-xs">
            {loading ? "…" : "Save"}
          </button>
          <button
            onClick={() => {
              setRescheduling(false);
              setDateDraft(toLocalInputValue(scheduledAt));
            }}
            disabled={loading}
            className="btn-secondary px-2.5 py-1 text-xs"
          >
            Never mind
          </button>
        </div>
        {error && <span className="text-xs" style={{ color: "var(--danger-fg)" }}>{error}</span>}
      </div>
    );
  }

  if (confirmingCancel) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-[var(--muted)]">Cancel this send?</span>
        <button onClick={cancel} disabled={loading} className="btn-danger px-2.5 py-1 text-xs">
          {loading ? "…" : "Yes, cancel"}
        </button>
        <button onClick={() => setConfirmingCancel(false)} disabled={loading} className="btn-secondary px-2.5 py-1 text-xs">
          Never mind
        </button>
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-[var(--muted)]">Delete for good?</span>
        <button onClick={deleteForever} disabled={loading} className="btn-danger px-2.5 py-1 text-xs">
          {loading ? "…" : "Yes, delete"}
        </button>
        <button onClick={() => setConfirmingDelete(false)} disabled={loading} className="btn-secondary px-2.5 py-1 text-xs">
          Never mind
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 justify-end">
        {(status === "PENDING" || status === "CANCELLED" || status === "FAILED") && (
          <button
            onClick={() => setRescheduling(true)}
            className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1"
          >
            <CalendarClock size={12} />
            Reschedule
          </button>
        )}
        {status === "PENDING" && (
          <button onClick={() => setConfirmingCancel(true)} className="btn-secondary px-3 py-1.5 text-xs">
            Cancel
          </button>
        )}
        {status !== "PENDING" && (
          <button onClick={() => setConfirmingDelete(true)} className="btn-danger px-3 py-1.5 text-xs">
            Delete
          </button>
        )}
      </div>
      {error && <span className="text-xs" style={{ color: "var(--danger-fg)" }}>{error}</span>}
    </div>
  );
}
