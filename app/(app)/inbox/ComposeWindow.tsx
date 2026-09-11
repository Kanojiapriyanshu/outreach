"use client";

import { useState } from "react";
import { X, Minus, Maximize2, Minimize2, Trash2, Send, Loader2 } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { useAttachments, AttachmentList, TemplatePicker, templateToHtml } from "./composerParts";

export default function ComposeWindow({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [minimized, setMinimized] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  // No clear() needed here: discarding closes the whole window, which unmounts this state.
  const { attachments, removeAt, totalBytes, AttachButton } = useAttachments();

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          html,
          attachments: attachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send that");
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  function discard() {
    const hasContent = to || subject || html.replace(/<[^>]*>/g, "").trim() || attachments.length > 0;
    if (hasContent && !confirm("Discard this message?")) return;
    onClose();
  }

  if (minimized) {
    return (
      <div className="fixed bottom-0 right-4 z-50 w-72 card rounded-b-none shadow-xl" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <span className="text-sm font-medium text-[var(--ink)] truncate">{subject || "New Message"}</span>
          <div className="flex items-center gap-0.5 shrink-0">
            <IconButton label="Expand" onClick={() => setMinimized(false)}><Maximize2 size={13} /></IconButton>
            <IconButton label="Discard" onClick={discard}><X size={14} /></IconButton>
          </div>
        </div>
      </div>
    );
  }

  const frameClass = fullScreen
    ? "fixed inset-4 md:inset-12 z-50 flex flex-col card shadow-xl"
    : "fixed bottom-0 right-0 md:right-4 z-50 flex flex-col card rounded-b-none w-full md:w-[34rem] max-h-[85vh] shadow-xl";

  return (
    <div className={frameClass} style={{ boxShadow: "var(--shadow-card)" }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)] shrink-0" style={{ background: "var(--bg)" }}>
        <span className="text-sm font-medium text-[var(--ink)]">New Message</span>
        <div className="flex items-center gap-0.5">
          <IconButton label="Minimise" onClick={() => setMinimized(true)}><Minus size={14} /></IconButton>
          <IconButton label={fullScreen ? "Exit full screen" : "Full screen"} onClick={() => setFullScreen(!fullScreen)}>
            {fullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </IconButton>
          <IconButton label="Close" onClick={discard}><X size={15} /></IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5">
        {/* Recipients */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] py-1.5">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
            className="flex-1 bg-transparent outline-none text-[13.5px] text-[var(--ink)] placeholder:text-[var(--muted-2)]"
          />
          <div className="flex items-center gap-2 text-xs text-[var(--muted-2)] shrink-0">
            {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-[var(--ink)]">Cc</button>}
            {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-[var(--ink)]">Bcc</button>}
          </div>
        </div>

        {showCc && (
          <input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Cc"
            className="w-full bg-transparent outline-none text-[13.5px] text-[var(--ink)] placeholder:text-[var(--muted-2)] border-b border-[var(--border)] py-1.5"
          />
        )}
        {showBcc && (
          <input
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="Bcc"
            className="w-full bg-transparent outline-none text-[13.5px] text-[var(--ink)] placeholder:text-[var(--muted-2)] border-b border-[var(--border)] py-1.5"
          />
        )}

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full bg-transparent outline-none text-[13.5px] text-[var(--ink)] placeholder:text-[var(--muted-2)] border-b border-[var(--border)] py-1.5"
        />

        {/* Templates — the CRM already has the team's approved copy, so composing from it beats
            retyping it or pasting from somewhere else. */}
        <div className="py-2">
          <TemplatePicker
            onApply={(t) => {
              if (!subject.trim()) setSubject(t.subject);
              setHtml((prev) => (prev.replace(/<[^>]*>/g, "").trim() ? prev : templateToHtml(t.body)));
            }}
          />
        </div>

        <RichTextEditor
          value={html}
          onChange={setHtml}
          placeholder="Write your message…"
          minHeight={fullScreen ? 320 : 180}
        />

        <AttachmentList attachments={attachments} totalBytes={totalBytes} onRemove={removeAt} />

        {error && (
          <p className="py-2 text-xs" style={{ color: "var(--danger-fg)" }}>
            {error}
          </p>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-t border-[var(--border)] shrink-0">
        <button
          onClick={send}
          disabled={sending || !to.trim()}
          className="btn-primary inline-flex items-center gap-1.5 px-5 py-2 text-sm disabled:opacity-50"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? "Sending…" : "Send"}
        </button>

        <AttachButton />

        <div className="ml-auto">
          <IconButton label="Discard draft" onClick={discard}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="p-1.5 rounded text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors"
    >
      {children}
    </button>
  );
}
