"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Clock, Loader2, Reply, Sparkles, X } from "lucide-react";
import { mentionsRosterLink, sharesCreators } from "@/lib/sharedLinks";
import { formatDateTime } from "@/lib/formatDate";
import { isTrackingNotification } from "@/lib/trackingSenders";
import RichTextEditor from "@/app/(app)/inbox/RichTextEditor";
import SchedulePicker from "@/app/(app)/inbox/SchedulePicker";
import { AttachmentList, MAX_TOTAL_BYTES, TemplatePicker, templateToHtml, useAttachments } from "@/app/(app)/inbox/composerParts";

interface ThreadMessage {
  id: string;
  fromName: string;
  fromAddress: string;
  toAddresses: string;
  snippet: string;
  bodyText: string | null;
  direction: "IN" | "OUT";
  sentAt: string;
}

// Stages a reply never changes — set by hand, finished, or already "list sent".
const FIXED_STAGES = ["NEGOTIATION", "CREATOR_SELECTED", "DEAL", "NOT_INTERESTED", "CREATOR_LIST_SENT"];

/** The part of a message written now, without the quoted chain underneath. */
function withoutQuote(body: string): string {
  const cut = [/^On .{0,120}wrote:\s*$/im, /^-{2,}\s*Original Message\s*-{2,}$/im, /^\s*>/m]
    .map((p) => body.match(p)?.index ?? body.length)
    .reduce((a, b) => Math.min(a, b), body.length);
  return body.slice(0, cut).trim() || body.trim();
}

/**
 * Reply to a brand or creator without leaving the outreach list: read what they wrote, answer in
 * the same email thread, and either send now or schedule it. Sending goes through the same route
 * the inbox uses, so the thread's "needs your reply" flag, follow-ups and stage update the same way
 * wherever the reply is written.
 */
export default function ReplyPanel({
  threadId,
  name,
  workspace,
  stage,
  variant = "button",
  rosterUrl,
}: {
  /** The inbox conversation to reply in. */
  threadId: string;
  name: string;
  workspace: "brands" | "influencers";
  stage: string;
  variant?: "button" | "primary";
  /** The public roster link, offered as a one-click insert when replying to a brand. */
  rosterUrl?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [html, setHtml] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [followUp, setFollowUp] = useState<"auto" | "none">("auto");
  const canMarkListSent = workspace === "brands" && !FIXED_STAGES.includes(stage);
  // Ticked for the team when the brand asked for creators or the reply carries the roster / a pitch
  // sheet link — until they change it themselves, after which their choice stands.
  const [listSentChoice, setListSentChoice] = useState<boolean | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { attachments, removeAt, totalBytes, AttachButton, clear: clearAttachments } = useAttachments();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't open this conversation");
      setMessages(data.thread.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open this conversation");
      setMessages([]);
    }
  }, [threadId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads when the panel opens
    if (open && messages === null) void load();
  }, [open, messages, load]);

  function close() {
    if (sending) return;
    setOpen(false);
    setPendingSchedule(null);
    setError(null);
    if (done) {
      setDone(null);
      setHtml("");
      clearAttachments();
      setMessages(null);
      router.refresh();
    }
  }

  async function send(scheduledAt: Date | null) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          cc: cc || undefined,
          attachments: attachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
          followUp,
          stage: canMarkListSent ? (listSent ? "list-sent" : "keep") : "auto",
          scheduledAt: scheduledAt?.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send that reply");
      setPendingSchedule(null);
      setDone(
        data.scheduled
          ? `Scheduled for ${formatDateTime(new Date(data.scheduledAt))}. It's no longer waiting on you — find it under Scheduled if you need to change it.`
          : data.followUp?.action === "auto" && data.followUp?.scheduledAt
            ? `Sent. If there's no answer, the next nudge goes out ${formatDateTime(new Date(data.followUp.scheduledAt))}.`
            : data.followUp?.action === "none"
              ? "Sent. Automated follow-ups are off for this one."
              : "Sent."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that reply");
    } finally {
      setSending(false);
    }
  }

  const real = (messages ?? []).filter((m) => !isTrackingNotification(m.fromAddress));
  const lastInbound = [...real].reverse().find((m) => m.direction === "IN");
  const replyTo = lastInbound?.fromAddress ?? real.at(-1)?.toAddresses ?? "";
  const shown = showAll ? real : lastInbound ? [lastInbound] : real.slice(-1);
  const empty = !html.replace(/<[^>]*>/g, "").trim() && attachments.length === 0;
  const tooBig = totalBytes > MAX_TOTAL_BYTES;
  const accent = workspace === "brands" ? "var(--brands-accent)" : "var(--influencers-accent)";
  const hasRosterLink = workspace === "brands" && mentionsRosterLink(html);
  const listSent = listSentChoice ?? (stage === "CREATOR_LIST_REQUESTED" || sharesCreators(html));

  function insertRosterLink() {
    if (!rosterUrl || mentionsRosterLink(html)) return;
    setHtml((prev) => `${prev}${prev.replace(/<[^>]*>/g, "").trim() ? "<br><br>" : ""}Here is our creator roster: <a href="${rosterUrl}">${rosterUrl}</a>`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-sm"
            : "btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs whitespace-nowrap"
        }
        title={`Reply to ${name} in the same email thread`}
      >
        <Reply size={variant === "primary" ? 15 : 12} /> Reply
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 text-left">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative card w-full sm:max-w-2xl max-h-[94vh] flex flex-col" style={{ boxShadow: "var(--shadow-pop)" }} role="dialog" aria-label={`Reply to ${name}`}>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
              <div className="min-w-0">
                <h2 className="font-semibold text-[15px] text-[var(--ink)] truncate">Reply to {name}</h2>
                <p className="text-xs text-[var(--muted-2)] truncate">
                  {replyTo ? (
                    <>
                      To <span className="text-[var(--ink)]">{replyTo}</span> · same email thread
                    </>
                  ) : (
                    "Opening the conversation…"
                  )}
                </p>
              </div>
              <button onClick={close} disabled={sending} className="p-1.5 rounded text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-40" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {done ? (
              <div className="px-5 py-8">
                <div className="flex items-start gap-2 rounded-xl p-3.5 text-sm" style={{ background: "var(--success-bg)", color: "var(--success-fg)" }}>
                  <CircleCheck size={16} className="shrink-0 mt-0.5" />
                  <span>{done}</span>
                </div>
                <div className="mt-5 flex justify-end">
                  <button onClick={close} className="btn-primary px-4 py-2 text-sm">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto scroll-slim px-5 py-4 space-y-4">
                  {messages === null ? (
                    <p className="flex items-center gap-2 text-sm text-[var(--muted-2)]">
                      <Loader2 size={14} className="animate-spin" /> Opening the conversation…
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {shown.map((m) => (
                        <div key={m.id} className="rounded-xl px-3.5 py-3 text-sm" style={{ background: "var(--surface-2)", borderLeft: `3px solid ${m.direction === "IN" ? accent : "var(--border-strong)"}` }}>
                          <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--muted-2)] mb-1">
                            <span className="font-medium text-[var(--ink)] truncate">{m.direction === "OUT" ? "You" : m.fromName || m.fromAddress}</span>
                            <span className="shrink-0">{formatDateTime(new Date(m.sentAt))}</span>
                          </div>
                          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-[var(--ink)] max-h-48 overflow-y-auto scroll-slim">
                            {withoutQuote(m.bodyText?.trim() || m.snippet || "(no content)")}
                          </pre>
                        </div>
                      ))}
                      {real.length > 1 && (
                        <button onClick={() => setShowAll(!showAll)} className="text-xs font-medium" style={{ color: "var(--brand-teal-dark)" }}>
                          {showAll ? "Show only their last message" : `Show the whole conversation (${real.length} emails)`}
                        </button>
                      )}
                    </div>
                  )}

                  {showCc && (
                    <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc — comma-separated addresses" className="input py-1.5 text-[13px]" aria-label="Cc" />
                  )}

                  <RichTextEditor value={html} onChange={setHtml} placeholder="Write your reply…" minHeight={150} autoFocus />
                  <AttachmentList attachments={attachments} totalBytes={totalBytes} onRemove={removeAt} />

                  <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-medium text-[var(--muted)] flex items-center gap-1.5">
                      <Clock size={12} /> After this sends
                    </p>
                    <label className="flex items-start gap-2 text-[13px] text-[var(--ink)] cursor-pointer">
                      <input type="radio" name={`followup-${threadId}`} checked={followUp === "auto"} onChange={() => setFollowUp("auto")} className="mt-0.5" />
                      <span>
                        Keep following up <span className="text-[var(--muted-2)]">— nudge them on the usual cadence if they go quiet</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-[13px] text-[var(--ink)] cursor-pointer">
                      <input type="radio" name={`followup-${threadId}`} checked={followUp === "none"} onChange={() => setFollowUp("none")} className="mt-0.5" />
                      <span>
                        Stop automation <span className="text-[var(--muted-2)]">— I&apos;m handling this one myself</span>
                      </span>
                    </label>
                    {canMarkListSent && (
                      <label className="flex items-start gap-2 text-[13px] text-[var(--ink)] cursor-pointer pt-2 border-t border-[var(--border)]">
                        <input type="checkbox" checked={listSent} onChange={(e) => setListSentChoice(e.target.checked)} className="mt-0.5" />
                        <span>
                          This reply shares creators <span className="text-[var(--muted-2)]">(the roster or a shortlist) — move the brand to “Creator List Sent”</span>
                        </span>
                      </label>
                    )}
                    {hasRosterLink && (
                      <p className="text-xs pt-1" style={{ color: "var(--success-fg)" }}>
                        Roster link found in your reply — this brand will show as “Roster sent”.
                      </p>
                    )}
                  </div>

                  {pendingSchedule && (
                    <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "var(--info-bg)", color: "var(--info-fg)" }}>
                      <span>Send this reply on {formatDateTime(pendingSchedule)}?</span>
                      <span className="flex gap-2">
                        <button onClick={() => void send(pendingSchedule)} disabled={sending || empty || tooBig} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
                          {sending ? "Scheduling…" : "Schedule reply"}
                        </button>
                        <button onClick={() => setPendingSchedule(null)} disabled={sending} className="btn-secondary px-3 py-1.5 text-xs">
                          Change
                        </button>
                      </span>
                    </div>
                  )}

                  {error && (
                    <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-t border-[var(--border)]">
                  <SchedulePicker disabled={sending || empty || tooBig || messages === null} sending={sending && !pendingSchedule} onSendNow={() => void send(null)} onPickTime={setPendingSchedule} />
                  <AttachButton />
                  <TemplatePicker onApply={(t) => setHtml((prev) => (prev.replace(/<[^>]*>/g, "").trim() ? prev : templateToHtml(t.body)))} />
                  {workspace === "brands" && rosterUrl && (
                    <button
                      onClick={insertRosterLink}
                      disabled={hasRosterLink}
                      className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs disabled:opacity-50"
                      title="Add the public creator roster link to your reply"
                    >
                      <Sparkles size={12} /> {hasRosterLink ? "Roster link added" : "Insert roster link"}
                    </button>
                  )}
                  {!showCc && (
                    <button onClick={() => setShowCc(true)} className="text-xs text-[var(--muted)] hover:text-[var(--ink)] px-1">
                      Cc
                    </button>
                  )}
                  <button onClick={close} disabled={sending} className="btn-secondary px-4 py-2 text-sm ml-auto">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
