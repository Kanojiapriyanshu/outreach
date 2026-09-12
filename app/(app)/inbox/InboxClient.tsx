"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Star,
  Archive,
  Trash2,
  MailOpen,
  Mail,
  Inbox as InboxIcon,
  Send,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ArchiveRestore,
  PenLine,
} from "lucide-react";
import ThreadView from "./ThreadView";
import ComposeWindow from "./ComposeWindow";
import type { InboxView } from "./page";

export interface InboxThreadRow {
  id: string;
  subject: string;
  snippet: string;
  fromName: string;
  fromAddress: string;
  lastMessageAt: string;
  messageCount: number;
  isUnread: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  sequence: { id: string; stage: string; status: string; outreachType: string } | null;
}

const VIEWS: { key: InboxView; label: string; icon: typeof InboxIcon }[] = [
  { key: "inbox", label: "Inbox", icon: InboxIcon },
  { key: "starred", label: "Starred", icon: Star },
  { key: "sent", label: "Sent", icon: Send },
  { key: "archived", label: "Archived", icon: Archive },
  { key: "trash", label: "Trash", icon: Trash2 },
];

/**
 * Dates the way a mail client does: time for today, day+month for this year, and the year once
 * it's old enough to matter. Keeps the right-hand column narrow and instantly scannable.
 */
function mailDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STAGE_LABEL: Record<string, string> = {
  FIRST_EMAIL_SENT: "Contacted",
  CREATOR_LIST_REQUESTED: "Wants list",
  CREATOR_LIST_SENT: "List sent",
  NEGOTIATION: "Negotiating",
  CREATOR_SELECTED: "Creator picked",
  DEAL: "Deal",
  NOT_INTERESTED: "Not interested",
};

export default function InboxClient({
  view,
  q,
  page,
  pageSize,
  total,
  unreadCount,
  hasAccount,
  twoWaySync,
  lastSyncedAt,
  accountEmail,
  openThreadId,
  threads,
}: {
  view: InboxView;
  q: string;
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
  hasAccount: boolean;
  twoWaySync: boolean;
  lastSyncedAt: string | null;
  accountEmail: string | null;
  openThreadId: string | null;
  threads: InboxThreadRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);
  // Applied immediately on click so the row reacts instantly; the server refresh confirms it.
  const [optimistic, setOptimistic] = useState<Record<string, Partial<InboxThreadRow>>>({});
  const [refreshing, setRefreshing] = useState(false);
  // Kept at this level, not inside the list, so it survives opening a conversation — a compose
  // window that vanished when you clicked something else to reference would be useless.
  const [composing, setComposing] = useState(false);
  // Gmail-style multi-select: a checkbox per row, plus a select-all in the toolbar. Cleared on any
  // navigation (search, page, view change) since a selection tied to "row 3 of this specific list"
  // stops meaning anything once the list underneath it changes.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  const rows = threads
    .map((t) => ({ ...t, ...optimistic[t.id] }))
    // A row that no longer belongs in the view it's being shown in (just archived out of the
    // inbox, say) disappears right away instead of lingering until the refresh lands.
    .filter((t) => {
      if (view === "inbox") return !t.isArchived && !t.isTrashed;
      if (view === "starred") return t.isStarred && !t.isTrashed;
      if (view === "archived") return t.isArchived && !t.isTrashed;
      if (view === "trash") return t.isTrashed;
      return true;
    });

  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      startTransition(() => router.push(`/inbox?${params.toString()}`, { scroll: false }));
      setSelected(new Set());
    },
    [router, searchParams]
  );

  /** Drops a row's local override so the server's value is authoritative again. */
  const forgetOptimistic = useCallback((id: string) => {
    setOptimistic((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  async function mutate(id: string, patch: Partial<InboxThreadRow>) {
    setOptimistic((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    try {
      await fetch(`/api/inbox/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      router.refresh();
    } catch {
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function syncNow() {
    setRefreshing(true);
    try {
      await fetch("/api/inbox/sync", { method: "POST" });
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  /** Same idea as mutate(), but for a whole selection at once: one optimistic update covering
   * every row, the PATCHes fired in parallel, one refresh at the end instead of one per row. */
  async function bulkMutate(ids: string[], patch: Partial<InboxThreadRow>) {
    if (ids.length === 0) return;
    setBulkWorking(true);
    setOptimistic((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...next[id], ...patch };
      return next;
    });
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/inbox/threads/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
        )
      );
      router.refresh();
    } finally {
      setBulkWorking(false);
      setSelected(new Set());
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = rows.length > 0 && rows.every((t) => selected.has(t.id));
  function toggleSelectAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(rows.map((t) => t.id)));
  }

  const composeWindow = composing ? (
    <ComposeWindow onClose={() => setComposing(false)} onSent={() => router.refresh()} />
  ) : null;

  if (openThreadId) {
    return (
      <>
        {composeWindow}
        <ThreadView
          threadId={openThreadId}
        // Opening a row optimistically marked it read here, so that override has to be dropped
        // on the way back — otherwise marking it unread inside the thread would return to a list
        // still insisting it's read, and the stale local value would win over the server's.
          onClose={() => {
            forgetOptimistic(openThreadId);
            navigate({ thread: null });
          }}
          onChanged={() => {
            forgetOptimistic(openThreadId);
            router.refresh();
          }}
        />
      </>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen md:-my-8 md:-mx-8">
      {composeWindow}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <button
          onClick={() => setComposing(true)}
          className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm shrink-0"
        >
          <PenLine size={15} />
          <span className="hidden sm:inline">Compose</span>
        </button>

        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={toggleSelectAll}
          disabled={rows.length === 0}
          aria-label={allVisibleSelected ? "Deselect all" : "Select all"}
          title={allVisibleSelected ? "Deselect all" : "Select all"}
          className="shrink-0 w-4 h-4 accent-current"
          style={{ color: "var(--brand-teal-dark)" }}
        />

        {selected.size > 0 ? (
          <div className="flex items-center gap-0.5 flex-1 min-w-0">
            <span className="text-xs font-medium text-[var(--muted)] mr-1.5 shrink-0">{selected.size} selected</span>
            <RowAction label="Mark as read" onClick={() => bulkMutate([...selected], { isUnread: false })} disabled={bulkWorking}>
              <MailOpen size={15} />
            </RowAction>
            <RowAction label="Mark as unread" onClick={() => bulkMutate([...selected], { isUnread: true })} disabled={bulkWorking}>
              <Mail size={15} />
            </RowAction>
            {view !== "trash" ? (
              <RowAction label="Archive" onClick={() => bulkMutate([...selected], { isArchived: true })} disabled={bulkWorking}>
                <Archive size={15} />
              </RowAction>
            ) : (
              <RowAction label="Restore" onClick={() => bulkMutate([...selected], { isTrashed: false })} disabled={bulkWorking}>
                <ArchiveRestore size={15} />
              </RowAction>
            )}
            <RowAction label={view === "trash" ? "Delete forever" : "Delete"} onClick={() => bulkMutate([...selected], { isTrashed: true })} disabled={bulkWorking}>
              <Trash2 size={15} />
            </RowAction>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-1 text-xs font-medium text-[var(--muted-2)] hover:text-[var(--ink)] shrink-0"
            >
              Clear
            </button>
          </div>
        ) : (
          <>
            <div className="relative flex-1 max-w-xl">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate({ q: search, page: null, thread: null });
                  if (e.key === "Escape") {
                    setSearch("");
                    navigate({ q: null, page: null });
                  }
                }}
                placeholder="Search mail"
                className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-transparent bg-[var(--bg)] focus:bg-[var(--surface)] focus:border-[var(--border)] outline-none transition-colors text-[var(--ink)]"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    navigate({ q: null, page: null });
                  }}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-2)] hover:text-[var(--ink)]"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <button
              onClick={syncNow}
              disabled={refreshing}
              title="Check for new mail now"
              className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--muted-2)] whitespace-nowrap">
              <span>
                {from}–{to} of {total}
              </span>
              <button
                onClick={() => navigate({ page: String(page - 1) })}
                disabled={page <= 1}
                aria-label="Newer"
                className="p-1 rounded hover:bg-[var(--bg)] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navigate({ page: String(page + 1) })}
                disabled={to >= total}
                aria-label="Older"
                className="p-1 rounded hover:bg-[var(--bg)] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 px-3 md:px-5 py-2 border-b border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => navigate({ view: v.key === "inbox" ? null : v.key, page: null, thread: null })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-[var(--brand-teal-light)] text-[var(--brand-teal-dark)]"
                  : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon size={14} />
              {v.label}
              {v.key === "inbox" && unreadCount > 0 && (
                <span className="ml-0.5 text-[11px] font-bold">({unreadCount})</span>
              )}
            </button>
          );
        })}
      </div>

      {hasAccount && !twoWaySync && (
        <div
          className="flex items-center justify-between gap-3 px-4 md:px-6 py-2 text-xs border-b border-[var(--border)]"
          // Translucent amber rather than a palette token: there's no warning colour in the theme,
          // and a tint works on both the light and dark backgrounds without needing two values.
          style={{ background: "rgba(244, 211, 94, 0.14)", color: "var(--ink)" }}
        >
          <span>
            Reading and replying work, but archiving, starring and read status won&rsquo;t reach Gmail itself until you
            reconnect this account once.
          </span>
          <a href="/settings" className="font-semibold whitespace-nowrap underline" style={{ color: "var(--brand-teal-dark)" }}>
            Reconnect
          </a>
        </div>
      )}

      {/* Thread list */}
      <div className={`flex-1 overflow-y-auto ${pending ? "opacity-60" : ""} transition-opacity`}>
        {!hasAccount && (
          <EmptyState
            title="No email account connected"
            body="Connect a Gmail account in Settings and your mail will start showing up here."
          />
        )}

        {hasAccount && rows.length === 0 && (
          <EmptyState
            title={q ? `Nothing matches “${q}”` : view === "inbox" ? "Inbox zero" : "Nothing here"}
            body={
              q
                ? "Try a different search, or clear it to see everything."
                : lastSyncedAt
                  ? `Last checked ${mailDate(lastSyncedAt)}${accountEmail ? ` · ${accountEmail}` : ""}.`
                  : "Mail is still syncing — this fills in within a couple of minutes."
            }
          />
        )}

        {rows.map((t) => (
          <div
            key={t.id}
            onClick={() => {
              if (t.isUnread) mutate(t.id, { isUnread: false });
              navigate({ thread: t.id });
            }}
            className={`group flex items-center gap-2 md:gap-3 px-3 md:px-5 h-[52px] md:h-[44px] border-b border-[var(--border)] cursor-pointer transition-colors ${
              selected.has(t.id) ? "bg-[var(--brand-teal-light)]" : t.isUnread ? "bg-[var(--surface)]" : "bg-[var(--bg)]"
            } hover:bg-[var(--brand-teal-light)]`}
          >
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSelect(t.id)}
              aria-label={selected.has(t.id) ? "Deselect" : "Select"}
              className="shrink-0 w-4 h-4 accent-current"
              style={{ color: "var(--brand-teal-dark)" }}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                mutate(t.id, { isStarred: !t.isStarred });
              }}
              aria-label={t.isStarred ? "Unstar" : "Star"}
              className="shrink-0 p-0.5 text-[var(--muted-2)] hover:text-[var(--brand-yellow)]"
              style={t.isStarred ? { color: "var(--brand-yellow)" } : undefined}
            >
              <Star size={15} fill={t.isStarred ? "currentColor" : "none"} />
            </button>

            <span
              className={`shrink-0 w-[130px] md:w-[180px] truncate text-[13px] ${
                t.isUnread ? "font-bold text-[var(--ink)]" : "text-[var(--muted)]"
              }`}
            >
              {t.fromName || t.fromAddress}
            </span>

            <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
              <span className={`truncate text-[13px] ${t.isUnread ? "font-bold text-[var(--ink)]" : "text-[var(--ink)]"}`}>
                {t.subject}
              </span>
              {t.messageCount > 1 && (
                <span className="shrink-0 text-[11px] text-[var(--muted-2)]">{t.messageCount}</span>
              )}
              <span className="hidden sm:inline truncate text-[13px] text-[var(--muted-2)]">— {t.snippet}</span>
            </div>

            {t.sequence && (
              <span
                className="hidden lg:inline shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }}
                title="This conversation is part of a tracked outreach sequence"
              >
                {STAGE_LABEL[t.sequence.stage] ?? t.sequence.stage}
              </span>
            )}

            {/* Hover actions replace the date, the way a mail client does */}
            <div className="shrink-0 w-[72px] flex justify-end items-center">
              <span className={`text-[11px] whitespace-nowrap md:group-hover:hidden ${t.isUnread ? "font-semibold text-[var(--ink)]" : "text-[var(--muted-2)]"}`}>
                {mailDate(t.lastMessageAt)}
              </span>
              <div className="hidden md:group-hover:flex items-center gap-0.5">
                <RowAction
                  label={t.isUnread ? "Mark as read" : "Mark as unread"}
                  onClick={() => mutate(t.id, { isUnread: !t.isUnread })}
                >
                  {t.isUnread ? <MailOpen size={14} /> : <Mail size={14} />}
                </RowAction>
                {view !== "trash" && (
                  <RowAction
                    label={t.isArchived ? "Move to inbox" : "Archive"}
                    onClick={() => mutate(t.id, { isArchived: !t.isArchived })}
                  >
                    {t.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </RowAction>
                )}
                <RowAction
                  label={t.isTrashed ? "Restore" : "Delete"}
                  onClick={() => mutate(t.id, { isTrashed: !t.isTrashed })}
                >
                  <Trash2 size={14} />
                </RowAction>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RowAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="p-1.5 rounded text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <InboxIcon size={32} className="text-[var(--muted-2)] mb-3" strokeWidth={1.5} />
      <p className="font-semibold text-sm text-[var(--ink)]">{title}</p>
      <p className="text-sm text-[var(--muted-2)] mt-1 max-w-sm">{body}</p>
    </div>
  );
}
