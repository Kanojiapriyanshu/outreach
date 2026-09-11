"use client";

import { useState, useRef, useCallback } from "react";
import { X, Minus, Maximize2, Minimize2, Paperclip, Trash2, Send, FileText, Loader2 } from "lucide-react";
import RichTextEditor from "./RichTextEditor";

interface PendingAttachment {
  filename: string;
  mimeType: string;
  data: string; // base64
  size: number;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  outreachType: string;
  step: number;
}

/** Matches the server-side cap in /api/inbox/send — serverless request bodies are limited, and
 * base64 inflates a file by about a third. */
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Templates are stored as plain text with {Variable} tags; this renders them into the HTML body
 * without pretending the tags are resolved — they stay visible so it's obvious what to fill in. */
function templateToHtml(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.trim() ? escapeHtml(line) : "<br>"))
    .join("<br>");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  const addFiles = useCallback(async (files: FileList) => {
    setError(null);
    const next: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      // Chunked so a large file doesn't blow the argument limit on String.fromCharCode.
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      next.push({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        data: btoa(binary),
        size: file.size,
      });
    }
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  async function loadTemplates() {
    setShowTemplates(!showTemplates);
    if (templates) return;
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setTemplates([]);
    }
  }

  function applyTemplate(t: Template) {
    if (!subject.trim()) setSubject(t.subject);
    setHtml((prev) => (prev.trim() ? prev : templateToHtml(t.body)));
    setShowTemplates(false);
  }

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
        <div className="relative py-2">
          <button
            onClick={loadTemplates}
            className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
          >
            <FileText size={12} /> Load template
          </button>
          {showTemplates && (
            <div className="absolute left-0 top-full mt-1 w-72 max-h-64 overflow-y-auto card p-1 z-10" style={{ boxShadow: "var(--shadow-card)" }}>
              {templates === null && <p className="px-2 py-3 text-xs text-[var(--muted-2)]">Loading…</p>}
              {templates?.length === 0 && <p className="px-2 py-3 text-xs text-[var(--muted-2)]">No templates yet.</p>}
              {templates?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="block w-full text-left rounded px-2 py-1.5 hover:bg-[var(--bg)]"
                >
                  <div className="text-xs font-medium text-[var(--ink)] truncate">{t.name}</div>
                  <div className="text-[11px] text-[var(--muted-2)] truncate">{t.subject}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <RichTextEditor
          value={html}
          onChange={setHtml}
          placeholder="Write your message…"
          minHeight={fullScreen ? 320 : 180}
        />

        {attachments.length > 0 && (
          <div className="py-2 space-y-1">
            {attachments.map((a, i) => (
              <div
                key={`${a.filename}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                <span className="truncate text-[var(--ink)]">{a.filename}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[var(--muted-2)]">{formatBytes(a.size)}</span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ${a.filename}`}
                    className="text-[var(--muted-2)] hover:text-[var(--ink)]"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
            <div className="text-[11px] text-[var(--muted-2)]">
              {formatBytes(totalBytes)} of {formatBytes(MAX_TOTAL_BYTES)} used
            </div>
          </div>
        )}

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

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <IconButton label="Attach files" onClick={() => fileInput.current?.click()}>
          <Paperclip size={15} />
        </IconButton>

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
