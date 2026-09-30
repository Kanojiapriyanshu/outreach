"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LAST_RUN_KEY = "fidem_catch_up_at";
// Matches the server's own gap: asking sooner would only be told "already fresh".
const MIN_GAP_MS = 5 * 60 * 1000;

function lastRun(): number {
  try {
    return Number(localStorage.getItem(LAST_RUN_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Sync-on-open. The worker sleeps up to an hour when there's nothing to send, so when someone opens
 * the CRM — or comes back to its tab after 5+ minutes — Gmail is synced and replies are read right
 * then, and the page refreshes if anything came in. Shared across tabs through localStorage, and the
 * server allows one run per 5 minutes on top of that, so a room of open tabs costs one sync.
 */
export function useCatchUpSync(onChanged?: () => void) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const run = useCallback(async () => {
    if (Date.now() - lastRun() < MIN_GAP_MS) return;
    try {
      localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
    } catch {
      // Private mode: the server's own 5-minute gap still applies.
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/catch-up", { method: "POST" });
      const data = await res.json();
      if (data.ran && (data.threadsSynced > 0 || data.repliesFound > 0)) {
        router.refresh();
        onChanged?.();
      }
    } catch {
      // A failed catch-up leaves the page as it was; the worker still runs on schedule.
    } finally {
      setSyncing(false);
    }
  }, [router, onChanged]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);

  return { syncing };
}
