"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
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

const LAST_SEEN_KEY = "fidem_notifications_last_seen";

/** A reply/bounce/opt-out feed, Gmail-notification style — separate from the full History log,
 * which is everything (including routine bookkeeping); this is only what actually needs eyes on
 * it. "Unread" is tracked per-browser via localStorage (no server-side read state) — simple, and
 * fine for how this is actually used: a personal "have I seen this yet" marker, not a shared
 * read/unread status across the team. */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // A failed poll just means the badge count stays whatever it was — not worth surfacing an
      // error for a background refresh.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastSeen(Number(localStorage.getItem(LAST_SEEN_KEY)) || 0);
    } catch {
      // ignore
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = Date.now();
      setLastSeen(now);
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(now));
      } catch {
        // ignore
      }
    }
  }

  const unreadCount = loaded ? notifications.filter((n) => new Date(n.timestamp).getTime() > lastSeen).length : 0;

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
      >
        <Bell size={17} strokeWidth={2} />
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "var(--danger-fg)", color: "#fff" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 md:left-auto md:right-0 top-full mt-2 w-80 max-w-[90vw] max-h-96 overflow-y-auto card p-2 z-50 shadow-xl"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
              Replies &amp; Updates
            </div>
            {notifications.length === 0 && (
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
