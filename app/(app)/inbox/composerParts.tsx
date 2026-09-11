"use client";

import { useState, useCallback, useRef } from "react";
import { X, FileText, Paperclip } from "lucide-react";

/**
 * The pieces a mail composer needs that are identical whether you're starting a new message or
 * replying to one — attachments, templates, and the sizing rules around them. Shared so the reply
 * box and the compose window can't drift apart in what they support.
 */

export interface PendingAttachment {
  filename: string;
  mimeType: string;
  /** Base64 (standard, not url-safe) file content. */
  data: string;
  size: number;
}

export interface MailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

/** Matches the server-side cap in the send routes — serverless request bodies are limited, and
 * base64 inflates a file by about a third. */
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Templates are stored as plain text with {Variable} tags. The tags are deliberately left
 * visible — it should be obvious what still needs filling in, not silently blank. */
export function templateToHtml(body: string): string {
  return body
    .split("\n")
    .map((line) => (line.trim() ? escapeHtml(line) : "<br>"))
    .join("<br>");
}

/** File picking and base64 encoding, kept out of the components that use it. */
export function useAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList) => {
    const next: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      // Chunked so a large file doesn't exceed the argument limit on String.fromCharCode.
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

  const removeAt = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const totalBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  /** Renders the hidden file input plus a button that opens the picker. */
  const AttachButton = useCallback(
    ({ label = "Attach files" }: { label?: string }) => (
      <>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          title={label}
          aria-label={label}
          onClick={() => inputRef.current?.click()}
          className="p-1.5 rounded text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
        >
          <Paperclip size={15} />
        </button>
      </>
    ),
    [addFiles]
  );

  return { attachments, addFiles, removeAt, totalBytes, AttachButton, clear: () => setAttachments([]) };
}

export function AttachmentList({
  attachments,
  totalBytes,
  onRemove,
}: {
  attachments: PendingAttachment[];
  totalBytes: number;
  onRemove: (index: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
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
              onClick={() => onRemove(i)}
              aria-label={`Remove ${a.filename}`}
              className="text-[var(--muted-2)] hover:text-[var(--ink)]"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
      <div
        className="text-[11px]"
        style={{ color: totalBytes > MAX_TOTAL_BYTES ? "var(--danger-fg)" : "var(--muted-2)" }}
      >
        {formatBytes(totalBytes)} of {formatBytes(MAX_TOTAL_BYTES)} used
      </div>
    </div>
  );
}

/** Loads the team's saved templates on first open and applies one to the draft. */
export function TemplatePicker({ onApply }: { onApply: (t: MailTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<MailTemplate[] | null>(null);

  async function toggle() {
    setOpen(!open);
    if (templates) return;
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setTemplates([]);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
      >
        <FileText size={12} /> Load template
      </button>
      {open && (
        <div
          className="absolute left-0 bottom-full mb-1 w-72 max-h-64 overflow-y-auto card p-1 z-20"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {templates === null && <p className="px-2 py-3 text-xs text-[var(--muted-2)]">Loading…</p>}
          {templates?.length === 0 && <p className="px-2 py-3 text-xs text-[var(--muted-2)]">No templates yet.</p>}
          {templates?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onApply(t);
                setOpen(false);
              }}
              className="block w-full text-left rounded px-2 py-1.5 hover:bg-[var(--bg)]"
            >
              <div className="text-xs font-medium text-[var(--ink)] truncate">{t.name}</div>
              <div className="text-[11px] text-[var(--muted-2)] truncate">{t.subject}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
