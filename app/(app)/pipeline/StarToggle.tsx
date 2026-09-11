"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";

export default function StarToggle({ sequenceId, initialImportant }: { sequenceId: string; initialImportant: boolean }) {
  const router = useRouter();
  const [important, setImportant] = useState(initialImportant);
  const [pending, setPending] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    const next = !important;
    setImportant(next); // optimistic — a star toggle should feel instant
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/star`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ important: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setImportant(!next); // revert on failure
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={important ? "Unmark as important" : "Mark as important"}
      className="shrink-0 p-0.5 hover:scale-110 transition-transform"
      style={{ color: important ? "var(--brand-yellow)" : "var(--muted-2)" }}
    >
      <Star size={15} fill={important ? "currentColor" : "none"} />
    </button>
  );
}
