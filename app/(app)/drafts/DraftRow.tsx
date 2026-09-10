"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DraftRow({ draftId, outreachType }: { draftId: string; outreachType: "BRAND" | "CREATOR" }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function deleteDraft() {
    setDeleting(true);
    try {
      await fetch(`/api/drafts/${draftId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-[var(--muted)]">Delete this draft?</span>
        <button onClick={deleteDraft} disabled={deleting} className="btn-danger px-2.5 py-1 text-xs">
          {deleting ? "…" : "Yes"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={deleting} className="btn-secondary px-2.5 py-1 text-xs">
          Never mind
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2 justify-end">
      <Link href={`/track?draftId=${draftId}&outreachType=${outreachType}`} className="btn-secondary px-3 py-1.5 text-xs">
        Continue Editing
      </Link>
      <button onClick={() => setConfirming(true)} className="btn-danger px-3 py-1.5 text-xs">
        Delete
      </button>
    </div>
  );
}
