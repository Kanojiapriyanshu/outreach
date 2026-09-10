"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell, ExternalLink, X } from "lucide-react";
import { formatDateTime } from "@/lib/formatDate";

interface Notification {
  id: string;
  eventType: string;
  description: string;
  timestamp: string;
  sequence: {
    id: string;
    outreachType: "BRAND" | "CREATOR";
    contact: { name: string; email: string; brand: { name: string } | null; creator: { name: string } | null };
  } | null;
}

interface InboxAlert {
  id: string;
  gmailThreadId: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

const LAST_SEEN_KEY = "fidem_notifications_last_seen";

/** Prefixes (or strips) the "(N) " unread-count badge on the browser tab title, Gmail-style —
 * reads whatever's currently there instead of a hardcoded base string, so it stays correct
 * regardless of which of this component's two mounted copies (desktop sidebar + mobile top bar,
 * see Nav.tsx) last touched it. */
function setTitleBadge(count: number) {
  if (typeof document === "undefined") return;
  const base = document.title.replace(/^\(\d+\+?\)\s/, "");
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
}

/**
 * Two feeds in one bell, Gmail-notification style:
 *  - Replies & Updates: high-signal ActivityLog events on threads the CRM is already tracking
 *    (a reply, a bounce, an opt-out).
 *  - New in Your Inbox: mail the inbox-watch pass (lib/inboxWatch.ts, runs every worker tick —
 *    every 5 minutes) found that ISN'T part of any tracked thread — a brand-new contact writing
 *    in, or a reply on something never attached to the CRM. Each one can be opened straight in
 *    Gmail to respond, turned into a new tracked outreach, or dismissed once handled.
 * "Unread" is tracked per-browser via localStorage (no server-side read state) — simple, and
 * fine for how this is actually used: a personal "have I seen this yet" marker, not a shared
 * read/unread status across the team. The count itself comes from the server (see
 * /api/notifications' `since` param) so a batch landing all at once still shows its real total
 * instead of being silently capped by the display lists.
 */
export default function NotificationsBell({ align = "right" }: { align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [inboxAlerts, setInboxAlerts] = useState<InboxAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dismissing, setDismissing] = useState<string | null>(null);

  // Re-reads the last-seen marker from localStorage on every call, rather than closing over it
  // once — the 60s poll interval below is set up a single time, so if it captured `since` instead
  // of re-reading it, opening the panel (which advances the marker) would have no effect on the
  // next poll and the badge would jump right back to counting everything since before it opened.
  const load = useCallback(async () => {
    let since = 0;
    try {
      since = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
    } catch {
      // ignore
    }
    try {
      const res = await fetch(`/api/notifications?since=${encodeURIComponent(new Date(since).toISOString())}`);
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setInboxAlerts(data.inboxAlerts ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setTitleBadge(data.unreadCount ?? 0);
    } catch {
      // A failed poll just means the badge count stays whatever it was — not worth surfacing an
      // error for a background refresh.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = Date.now();
      setUnreadCount(0);
      setTitleBadge(0);
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(now));
      } catch {
        // ignore
      }
    }
  }

  async function dismissAlert(id: string) {
    setDismissing(id);
    setInboxAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`/api/inbox-alerts/${id}`, { method: "PATCH" });
    } catch {
      // A failed dismiss just means it reappears on the next poll — not worth reverting the
      // optimistic removal for.
    } finally {
      setDismissing(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
      >
        <Bell size={17} strokeWidth={2} />
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "var(--danger-fg)", color: "#fff" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full mt-2 w-80 max-w-[90vw] max-h-[28rem] overflow-y-auto card p-2 z-50 shadow-xl`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {inboxAlerts.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
                  New in Your Inbox
                </div>
                {inboxAlerts.map((a) => (
                  <div key={a.id} className="rounded-lg px-2.5 py-2 text-sm hover:bg-[var(--bg)] transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[var(--ink)] font-medium truncate">{a.fromName || a.fromAddress}</div>
                        <div className="text-[var(--muted-2)] text-xs truncate">{a.subject || "(no subject)"}</div>
                      </div>
                      <button
                        onClick={() => dismissAlert(a.id)}
                        disabled={dismissing === a.id}
                        aria-label="Dismiss"
                        className="shrink-0 p-1 rounded text-[var(--muted-2)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="text-[var(--muted-2)] text-xs mt-1 line-clamp-2">{a.snippet}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <a
                        href={`https://mail.google.com/mail/u/0/#all/${a.gmailThreadId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium"
                        style={{ color: "var(--brand-teal-dark)" }}
                      >
                        <ExternalLink size={11} /> Open in Gmail
                      </a>
                      <Link
                        href={`/track?contactEmail=${encodeURIComponent(a.fromAddress)}`}
                        onClick={() => setOpen(false)}
                        className="font-medium"
                        style={{ color: "var(--brand-teal-dark)" }}
                      >
                        Track as outreach
                      </Link>
                      <span className="text-[var(--muted-2)] ml-auto">{formatDateTime(new Date(a.receivedAt))}</span>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
              Replies &amp; Updates
            </div>
            {notifications.length === 0 && inboxAlerts.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-[var(--muted-2)]">Nothing yet — you&rsquo;re all caught up.</p>
            )}
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={n.sequence ? `/dashboard/${n.sequence.id}` : "/activity"}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2.5 py-2 text-sm hover:bg-[var(--bg)] transition-colors"
              >
                <div className="text-[var(--ink)]">{n.description}</div>
                <div className="text-[var(--muted-2)] text-xs mt-0.5">
                  {n.sequence?.contact.name ?? n.sequence?.contact.email ?? ""} · {formatDateTime(new Date(n.timestamp))}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
