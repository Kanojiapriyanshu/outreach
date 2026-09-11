"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  Reply,
  Send,
  MailOpen,
  Loader2,
  ExternalLink,
  CircleCheck,
  Clock,
} from "lucide-react";
import { formatDateTime } from "@/lib/formatDate";
import RichTextEditor from "./RichTextEditor";
import { useAttachments, AttachmentList, TemplatePicker, templateToHtml } from "./composerParts";
import { isTrackingNotification } from "@/lib/trackingSenders";

interface ThreadMessage {
  id: string;
  fromName: string;
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  direction: "IN" | "OUT";
  sentAt: string;
}

interface Thread {
  id: string;
  subject: string;
  isUnread: boolean;
  isStarred: boolean;
  isArchived: boolean;
  gmailThreadId: string;
  sequenceId: string | null;
  accountEmail: string;
  messages: ThreadMessage[];
}

type FollowUpChoice = "auto" | "none";

export default function ThreadView({
  threadId,
  onClose,
  onChanged,
}: {
  threadId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [replyHtml, setReplyHtml] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const { attachments, removeAt, totalBytes, AttachButton, clear: clearAttachments } = useAttachments();
  const [followUp, setFollowUp] = useState<FollowUpChoice>("auto");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentConfirmation, setSentConfirmation] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't open this conversation");
      setThread(data.thread);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open this conversation");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function mutate(patch: Record<string, boolean>) {
    if (!thread) return;
    setThread({ ...thread, ...patch });
    await fetch(`/api/inbox/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    onChanged();
  }

  async function sendReply() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: replyHtml,
          cc: cc || undefined,
          bcc: bcc || undefined,
          attachments: attachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
          followUp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send that reply");

      setReplyHtml("");
      clearAttachments();
      setCc("");
      setBcc("");
      setReplying(false);
      setSentConfirmation(
        data.followUp?.action === "auto" && data.followUp?.scheduledAt
          ? `Sent. If there's no answer, the next nudge goes out ${formatDateTime(new Date(data.followUp.scheduledAt))}.`
          : data.followUp?.action === "none"
            ? "Sent. Automated follow-ups are off for this one — it's yours to handle."
            : "Sent."
      );
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that reply");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-2)]">
        <Loader2 size={18} className="animate-spin mr-2" /> Opening…
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="p-6">
        <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back to inbox
        </button>
        <p className="mt-4 text-sm" style={{ color: "var(--danger-fg)" }}>{error ?? "Conversation not found."}</p>
      </div>
    );
  }

  // Mirrors the server's choice of recipient exactly — including skipping read-tracking robots,
  // whose notifications thread into the real conversation — so the address shown in the reply box
  // is always the one the reply actually goes to.
  const lastInbound = [...thread.messages]
    .reverse()
    .find((m) => m.direction === "IN" && !isTrackingNotification(m.fromAddress));
  const replyTo = lastInbound?.fromAddress ?? thread.messages[thread.messages.length - 1]?.toAddresses ?? "";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen md:-my-8 md:-mx-8">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 md:px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
        <button
          onClick={onClose}
          aria-label="Back to inbox"
          className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
        >
          <ArrowLeft size={17} />
        </button>
        <ToolbarButton
          label={thread.isStarred ? "Unstar" : "Star"}
          onClick={() => mutate({ isStarred: !thread.isStarred })}
          active={thread.isStarred}
        >
          <Star size={16} fill={thread.isStarred ? "currentColor" : "none"} />
        </ToolbarButton>
        <ToolbarButton
          label={thread.isArchived ? "Move to inbox" : "Archive"}
          onClick={() => {
            mutate({ isArchived: !thread.isArchived });
            onClose();
          }}
        >
          <Archive size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Delete"
          onClick={() => {
            mutate({ isTrashed: true });
            onClose();
          }}
        >
          <Trash2 size={16} />
        </ToolbarButton>
        {/* Opening a conversation marks it read, so the useful action here is putting it back —
            and like every mail client, doing that returns you to the list, since the whole point
            is leaving it for later rather than continuing to read it now. */}
        <ToolbarButton
          label="Mark as unread"
          onClick={() => {
            mutate({ isUnread: true });
            onClose();
          }}
        >
          <MailOpen size={16} />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-3">
          {thread.sequenceId && (
            <Link
              href={`/dashboard/${thread.sequenceId}`}
              className="text-xs font-medium hidden sm:inline"
              style={{ color: "var(--brand-teal-dark)" }}
            >
              View pipeline →
            </Link>
          )}
          <a
            href={`https://mail.google.com/mail/u/0/#all/${thread.gmailThreadId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Gmail"
            className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
          <h1 className="text-[20px] md:text-[22px] font-semibold tracking-tight text-[var(--ink)] mb-5 break-words">
            {thread.subject}
          </h1>

          <div className="space-y-3">
            {thread.messages.map((m) => (
              <MessageCard key={m.id} message={m} accountEmail={thread.accountEmail} />
            ))}
          </div>

          {sentConfirmation && (
            <div
              className="mt-4 flex items-start gap-2 rounded-xl p-3.5 text-sm"
              style={{ background: "var(--success-bg)", color: "var(--success-fg)" }}
            >
              <CircleCheck size={16} className="shrink-0 mt-0.5" />
              <span>{sentConfirmation}</span>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm" style={{ color: "var(--danger-fg)" }}>
              {error}
            </p>
          )}

          {/* Reply */}
          <div className="mt-4 mb-10">
            {!replying ? (
              <button
                onClick={() => {
                  setReplying(true);
                  setSentConfirmation(null);
                }}
                className="btn-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm"
              >
                <Reply size={15} /> Reply
              </button>
            ) : (
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted-2)] pb-2 border-b border-[var(--border)]">
                  <span className="truncate">
                    To <span className="text-[var(--ink)]">{replyTo}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-[var(--ink)]">Cc</button>}
                    {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-[var(--ink)]">Bcc</button>}
                  </div>
                </div>

                {showCc && (
                  <input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="Cc"
                    className="w-full bg-transparent outline-none text-[13px] text-[var(--ink)] placeholder:text-[var(--muted-2)] border-b border-[var(--border)] pb-1.5"
                  />
                )}
                {showBcc && (
                  <input
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="Bcc"
                    className="w-full bg-transparent outline-none text-[13px] text-[var(--ink)] placeholder:text-[var(--muted-2)] border-b border-[var(--border)] pb-1.5"
                  />
                )}

                <RichTextEditor
                  value={replyHtml}
                  onChange={setReplyHtml}
                  placeholder="Write your reply…"
                  minHeight={160}
                  autoFocus
                />

                <AttachmentList attachments={attachments} totalBytes={totalBytes} onRemove={removeAt} />

                {/* The decision that keeps automation honest: a hand-written reply supersedes
                    whatever was queued, so the person writing it says what happens next. */}
                {thread.sequenceId && (
                  <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-medium text-[var(--muted)] mb-2 flex items-center gap-1.5">
                      <Clock size={12} /> After this sends
                    </p>
                    <div className="space-y-1.5">
                      <FollowUpOption
                        selected={followUp === "auto"}
                        onSelect={() => setFollowUp("auto")}
                        title="Keep following up"
                        detail="If they go quiet, resume nudges on the usual cadence."
                      />
                      <FollowUpOption
                        selected={followUp === "none"}
                        onSelect={() => setFollowUp("none")}
                        title="Stop automation"
                        detail="I'm handling this conversation myself from here."
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={sendReply}
                    disabled={sending || (!replyHtml.replace(/<[^>]*>/g, "").trim() && attachments.length === 0)}
                    className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <Send size={14} /> {sending ? "Sending…" : "Send"}
                  </button>
                  <AttachButton />
                  <TemplatePicker
                    onApply={(t) => setReplyHtml((prev) => (prev.replace(/<[^>]*>/g, "").trim() ? prev : templateToHtml(t.body)))}
                  />
                  <button
                    onClick={() => {
                      setReplying(false);
                      setReplyHtml("");
                      clearAttachments();
                    }}
                    disabled={sending}
                    className="btn-secondary px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Where the quoted reply chain starts. The ">"-prefixed convention is the reliable one because
// clients add it themselves rather than translating it; the header lines are an English-only
// bonus catch. Matches the server-side trimming in lib/gmail.ts.
const QUOTE_MARKERS = [
  /^On .{0,120}wrote:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}$/im,
  /^From:\s.+$/im,
  /^\s*>/m,
];

/** Splits a body into the part actually written now and the quoted chain underneath it, so the
 * chain can be collapsed behind a toggle the way every mail client does. */
function splitQuoted(body: string): { visible: string; quoted: string | null } {
  let cut = body.length;
  for (const pattern of QUOTE_MARKERS) {
    const match = body.match(pattern);
    if (match?.index != null && match.index < cut) cut = match.index;
  }
  if (cut >= body.length) return { visible: body, quoted: null };
  const visible = body.slice(0, cut).trim();
  const quoted = body.slice(cut).trim();
  // A message that's *only* a quote (a bare forward) should still show something.
  if (!visible) return { visible: body, quoted: null };
  return { visible, quoted: quoted || null };
}

function MessageCard({ message, accountEmail }: { message: ThreadMessage; accountEmail: string }) {
  const [expanded, setExpanded] = useState(true);
  const [showQuoted, setShowQuoted] = useState(false);
  const isOut = message.direction === "OUT";
  const { visible, quoted } = splitQuoted(message.bodyText?.trim() || message.snippet || "(no content)");

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--bg)] transition-colors"
      >
        <div
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={
            isOut
              ? { background: "var(--brand-teal-light)", color: "var(--brand-teal-dark)" }
              : { background: "var(--neutral-bg)", color: "var(--neutral-fg)" }
          }
        >
          {(message.fromName || message.fromAddress).slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-sm text-[var(--ink)] truncate">
              {isOut ? "You" : message.fromName || message.fromAddress}
            </span>
            <span className="text-[11px] text-[var(--muted-2)] shrink-0">
              {formatDateTime(new Date(message.sentAt))}
            </span>
          </div>
          <div className="text-xs text-[var(--muted-2)] truncate">
            {isOut ? `to ${message.toAddresses}` : `to ${accountEmail}`}
          </div>
          {!expanded && <div className="text-xs text-[var(--muted-2)] truncate mt-0.5">{message.snippet}</div>}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]">
          <pre className="whitespace-pre-wrap break-words font-sans text-[13.5px] leading-relaxed text-[var(--ink)]">
            {visible}
          </pre>
          {quoted && (
            <>
              <button
                onClick={() => setShowQuoted(!showQuoted)}
                title={showQuoted ? "Hide quoted text" : "Show quoted text"}
                aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
                className="mt-2 px-1.5 py-0.5 rounded text-[var(--muted-2)] hover:bg-[var(--bg)] leading-none"
                style={{ background: "var(--neutral-bg)" }}
              >
                •••
              </button>
              {showQuoted && (
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-[var(--muted-2)] pl-3" style={{ borderLeft: "2px solid var(--border)" }}>
                  {quoted}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FollowUpOption({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface)]"
      style={selected ? { background: "var(--surface)", border: "1px solid var(--brand-teal-dark)" } : { border: "1px solid transparent" }}
    >
      <span
        className="shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: selected ? "var(--brand-teal-dark)" : "var(--border)" }}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand-teal-dark)" }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-[var(--ink)]">{title}</span>
        <span className="block text-xs text-[var(--muted-2)]">{detail}</span>
      </span>
    </button>
  );
}

function ToolbarButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
      style={active ? { color: "var(--brand-yellow)" } : undefined}
    >
      {children}
    </button>
  );
}
