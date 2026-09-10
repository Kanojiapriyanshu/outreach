"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Star } from "lucide-react";

export default function SequenceControls({
  sequenceId,
  status,
  hasPending,
  isImportant,
}: {
  sequenceId: string;
  status: string;
  hasPending: boolean;
  isImportant: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [important, setImportant] = useState(isImportant);
  const [starPending, setStarPending] = useState(false);

  async function deleteThread() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't move this to Trash — try again.");
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move this to Trash — try again.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function toggleStar() {
    if (starPending) return;
    setStarPending(true);
    const next = !important;
    setImportant(next);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/star`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ important: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setImportant(!next);
    } finally {
      setStarPending(false);
    }
  }

  async function run(action: string) {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work — try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work — try again.");
    } finally {
      setLoading(null);
    }
  }

  const isFinal = ["REPLIED", "BOUNCED", "UNSUBSCRIBED", "STOPPED", "COMPLETED"].includes(status);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={toggleStar}
          disabled={starPending}
          aria-label={important ? "Unmark as important" : "Mark as important"}
          className="btn-secondary px-3 py-2 text-sm inline-flex items-center gap-1.5"
          style={important ? { color: "var(--brand-yellow)" } : undefined}
        >
          <Star size={15} fill={important ? "currentColor" : "none"} />
          {important ? "Important" : "Mark Important"}
        </button>
        {status === "PAUSED" ? (
          <Btn onClick={() => run("RESUME")} loading={loading === "RESUME"}>
            Resume Follow-Ups
          </Btn>
        ) : (
          <Btn onClick={() => run("PAUSE")} loading={loading === "PAUSE"} disabled={isFinal}>
            Pause Follow-Ups
          </Btn>
        )}
        <Btn onClick={() => run("STOP")} loading={loading === "STOP"} disabled={isFinal} variant="danger">
          Stop for Good
        </Btn>
        <Btn onClick={() => run("SKIP")} loading={loading === "SKIP"} disabled={isFinal || !hasPending}>
          Skip This One
        </Btn>
        <Btn onClick={() => run("SEND_NOW")} loading={loading === "SEND_NOW"} disabled={isFinal || !hasPending}>
          Send It Now
        </Btn>
        <Btn onClick={() => setConfirmingDelete(true)} variant="danger">
          Move to Trash
        </Btn>
      </div>
      {error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{error}</p>}

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.5)" }}
          onClick={() => !deleting && setConfirmingDelete(false)}
        >
          <div className="card p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-[var(--ink)] mb-2">Move this thread to Trash?</h3>
            <p className="text-sm text-[var(--muted)] mb-4">
              Follow-ups stop right away. You can restore it from Trash later, or delete it for good from there —
              nothing in Gmail itself is ever touched either way.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmingDelete(false)} disabled={deleting} className="btn-secondary px-4 py-2 text-sm">
                Cancel
              </button>
              <button onClick={deleteThread} disabled={deleting} className="btn-danger px-4 py-2 text-sm">
                {deleting ? "Moving…" : "Move to Trash"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  loading,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-4 py-2 text-sm ${variant === "danger" ? "btn-danger" : "btn-secondary"}`}
    >
      {loading ? "…" : children}
    </button>
  );
}
