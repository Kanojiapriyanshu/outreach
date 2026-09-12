"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import ComposeWindow from "../inbox/ComposeWindow";

/**
 * Opens the exact same Compose window the inbox uses, pre-filled and already classified as
 * CREATOR outreach — Discovery already knows that for certain, so there's nothing to guess.
 * Mounted locally rather than through any inbox-page state: ComposeWindow is a fixed-position
 * overlay that doesn't care which page put it on screen, so this is a thin wrapper, not a fork.
 */
export default function StartOutreachButton({
  disabled,
  to,
  contactName,
  channelName,
  channelUrl,
  niche,
}: {
  disabled?: boolean;
  to: string;
  contactName: string;
  channelName: string;
  channelUrl: string;
  niche?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "No public email found for this creator" : "Start outreach"}
        className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-40"
      >
        <Send size={13} /> Start Outreach
      </button>
      {open && (
        <ComposeWindow
          onClose={() => setOpen(false)}
          onSent={() => router.refresh()}
          initial={{
            to,
            contactName,
            channelName,
            channelUrl,
            niche,
            classification: { outreachType: "CREATOR" },
            subject: `Collab opportunity — ${channelName}`,
          }}
        />
      )}
    </>
  );
}
