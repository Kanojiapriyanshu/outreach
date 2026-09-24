"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Mail } from "lucide-react";
import { brandEmailDraft, gmailComposeUrl, type LinkState } from "@/lib/pitchSheet";

/** Row actions on the Pitch sheets tab: copy/open the link, email the brand, extend or turn it off. */
export default function PitchSheetActions({
  id,
  url,
  state,
  brandName,
  brandEmail,
  creatorNames,
  expiresAt,
}: {
  id: string;
  url: string;
  state: LinkState;
  brandName: string;
  brandEmail: string | null;
  creatorNames: string[];
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function change(action: "extend" | "turn-off") {
    if (action === "turn-off" && !confirm(`Turn off ${brandName}'s link now? They'll see "no longer available".`)) return;
    setBusy(true);
    try {
      await fetch(`/api/pitch-sheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days: 30 }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; Open still works.
    }
  }

  const email = brandEmailDraft({ brandName, url, creatorNames, expiresAt });

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap text-xs">
      {state === "live" ? (
        <>
          <button onClick={() => void copy()} className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center px-2 py-1.5" aria-label="Open the brand's view">
            <ExternalLink size={12} />
          </a>
          <a
            href={gmailComposeUrl(brandEmail, email.subject, email.body)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5"
            title="Opens a Gmail draft to the brand — nothing is sent until you press Send"
          >
            <Mail size={12} /> Email brand
          </a>
          <button onClick={() => void change("extend")} disabled={busy} className="font-medium disabled:opacity-40" style={{ color: "var(--brand-teal-dark)" }}>
            +30 days
          </button>
          <button onClick={() => void change("turn-off")} disabled={busy} className="font-medium text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40">
            Turn off
          </button>
        </>
      ) : (
        <button onClick={() => void change("extend")} disabled={busy} className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 disabled:opacity-40">
          {busy && <Loader2 size={12} className="animate-spin" />} Re-open for 30 days
        </button>
      )}
    </div>
  );
}
