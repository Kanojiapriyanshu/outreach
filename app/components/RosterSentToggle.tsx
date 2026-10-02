"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

/** Mark the public roster as shared with a brand (or undo it) when the system couldn't see it go out. */
export default function RosterSentToggle({ sequenceId, sent }: { sequenceId: string; sent: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/roster`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sent: !sent }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      onClick={() => void toggle()}
      disabled={saving}
      className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs whitespace-nowrap"
      title={sent ? "Remove the 'roster shared' mark" : "The roster link went to this brand (e.g. over WhatsApp or another inbox)"}
      style={failed ? { borderColor: "var(--danger-fg)", color: "var(--danger-fg)" } : undefined}
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {failed ? "Try again" : sent ? "Unmark roster" : "Mark roster sent"}
    </button>
  );
}
