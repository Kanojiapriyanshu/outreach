"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import ComposeWindow from "../inbox/ComposeWindow";

/** The channel's About page, where YouTube shows the "View email address" button. */
function aboutPageUrl(channelUrl: string): string {
  return `${channelUrl.replace(/\/+$/, "")}/about`;
}

/**
 * Opens the exact same Compose window the inbox uses, pre-filled and already classified as
 * CREATOR outreach — Discovery already knows that for certain, so there's nothing to guess.
 * Mounted locally rather than through any inbox-page state: ComposeWindow is a fixed-position
 * overlay that doesn't care which page put it on screen, so this is a thin wrapper, not a fork.
 *
 * Never disabled for a missing email. Most creators keep their business email behind YouTube's
 * "View email address" button, which the API can't read — so a blank email usually means "not in
 * the description", not "unreachable". Compose opens with To empty and points at the About page.
 */
export default function StartOutreachButton({
  to,
  contactName,
  channelName,
  channelUrl,
  niche,
}: {
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
        title={to ? "Start outreach" : "No public email found — you can add one when composing"}
        className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
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
            emailLookupUrl: to ? undefined : aboutPageUrl(channelUrl),
            personalizeChannelUrl: channelUrl,
          }}
        />
      )}
    </>
  );
}
