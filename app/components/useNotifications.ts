"use client";

import { useCallback, useEffect, useState } from "react";

export interface UnreadThread {
  id: string;
  subject: string;
  snippet: string;
  fromName: string;
  fromAddress: string;
  lastMessageAt: string;
  sequenceId: string | null;
}

export interface DeliveryAlert {
  id: string;
  description: string;
  timestamp: string;
  sequence: { id: string; contact: { name: string; email: string } } | null;
}

export const LAST_SEEN_KEY = "fidem_notifications_last_seen";

const POLL_MS = 60_000;

/** Prefixes (or strips) the "(N) " unread badge on the browser tab title, Gmail-style. Reads
 * whatever's currently there rather than a hardcoded base string, so it can't compound. */
function setTitleBadge(count: number) {
  if (typeof document === "undefined") return;
  const base = document.title.replace(/^\(\d+\+?\)\s/, "");
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
}

/**
 * One poll, shared. The nav badge and both copies of the bell (desktop sidebar + mobile top bar)
 * all need the same numbers, so this is owned once by Nav and passed down rather than having
 * three components independently hitting the same endpoint every 30 seconds.
 */
export function useNotifications() {
  const [threads, setThreads] = useState<UnreadThread[]>([]);
  const [alerts, setAlerts] = useState<DeliveryAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [waiting, setWaiting] = useState<{ brands: number; influencers: number }>({ brands: 0, influencers: 0 });

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
      setThreads(data.unreadThreads ?? []);
      setAlerts(data.alerts ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setWaiting(data.waiting ?? { brands: 0, influencers: 0 });
      setTitleBadge(data.unreadCount ?? 0);
    } catch {
      // A failed background poll just leaves the last known numbers in place.
    }
  }, []);

  useEffect(() => {
    // Only while the tab is on screen. Every poll is a database query, and the database is on a
    // plan metered by the hour that sleeps after 5 idle minutes — a CRM tab left open in the
    // background used to keep it awake all day on its own. Coming back to the tab refreshes at once.
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      void load();
      interval = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  return { threads, alerts, unreadCount, waiting, reload: load };
}
