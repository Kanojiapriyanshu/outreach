"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/formatDate";
import { LAST_SEEN_KEY, type UnreadThread, type DeliveryAlert } from "./useNotifications";

/**
 * Unread mail and delivery problems, in one bell.
 *
 * The count is simply "unread conversations in the inbox" — the same number the inbox itself
 * shows. That's what makes it honest: reading something (here, in the app's inbox, or in Gmail)
 * clears it, so the badge can't disagree with what's actually sitting there. Bounces and opt-outs
 * are added on top, since those need attention but aren't conversations that can be read.
 *
 * Data is owned by Nav and passed in, so one poll feeds this, its mobile twin, and the nav badge.
 */
export default function NotificationsBell({
  align = "right",
  threads,
  alerts,
  unreadCount,
}: {
  align?: "left" | "right";
  threads: UnreadThread[];
  alerts: DeliveryAlert[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    // Opening acknowledges the *delivery alerts*, which have no other read state. Unread mail
    // deliberately isn't cleared here — it clears when the mail is actually read, which is the
    // only thing that makes the number mean what it says.
    if (next) {
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      } catch {
        // ignore
      }
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
            className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full mt-2 w-[21rem] max-w-[90vw] max-h-[28rem] overflow-y-auto card p-2 z-50 shadow-xl`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {alerts.length > 0 && (
              <>
                <div
                  className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--danger-fg)" }}
                >
                  Needs Attention
                </div>
                {alerts.map((a) => (
                  <Link
                    key={a.id}
                    href={a.sequence ? `/dashboard/${a.sequence.id}` : "/activity"}
                    onClick={() => setOpen(false)}
                    className="flex gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-[var(--bg)] transition-colors"
                  >
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "var(--danger-fg)" }} />
                    <div className="min-w-0">
                      <div className="text-[var(--ink)]">{a.description}</div>
                      <div className="text-[var(--muted-2)] text-xs mt-0.5">{formatDateTime(new Date(a.timestamp))}</div>
                    </div>
                  </Link>
                ))}
              </>
            )}

            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">Unread Mail</span>
              <Link
                href="/inbox"
                onClick={() => setOpen(false)}
                className="text-xs font-medium"
                style={{ color: "var(--brand-teal-dark)" }}
              >
                Open inbox
              </Link>
            </div>

            {threads.length === 0 && alerts.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-[var(--muted-2)]">All caught up.</p>
            )}

            {threads.map((t) => (
              <Link
                key={t.id}
                href={`/inbox?thread=${t.id}`}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2.5 py-2 hover:bg-[var(--bg)] transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-sm text-[var(--ink)] truncate">{t.fromName || t.fromAddress}</span>
                  <span className="text-[10px] text-[var(--muted-2)] shrink-0">
                    {formatDateTime(new Date(t.lastMessageAt))}
                  </span>
                </div>
                <div className="text-[13px] text-[var(--ink)] truncate">{t.subject}</div>
                <div className="text-xs text-[var(--muted-2)] truncate">{t.snippet}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
