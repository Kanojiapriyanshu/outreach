"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Copies the roster link (with whatever niche is picked) — so a brand can pass it on internally. */
export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Fidem Growth creator roster", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Dismissed share sheet or blocked clipboard — nothing to do.
    }
  }
  return (
    <button
      onClick={() => void share()}
      aria-label="Share this roster"
      title={copied ? "Link copied" : "Share this roster"}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0a0b12] transition hover:bg-white/90"
    >
      {copied ? <Check size={15} /> : <Share2 size={15} />}
    </button>
  );
}
