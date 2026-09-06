"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SequenceControls({
  sequenceId,
  status,
  hasPending,
}: {
  sequenceId: string;
  status: string;
  hasPending: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      </div>
      {error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{error}</p>}
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
