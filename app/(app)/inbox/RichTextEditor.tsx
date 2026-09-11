"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Quote,
  IndentIncrease,
  IndentDecrease,
  RemoveFormatting,
  Undo2,
  Redo2,
} from "lucide-react";

/**
 * A contentEditable rich-text body with the formatting a mail client is expected to have.
 *
 * This uses document.execCommand, which is formally deprecated but is still the only thing every
 * browser implements for contentEditable formatting, and is what most lightweight editors are
 * built on. The alternative is pulling in a full editor framework, which is a lot of weight for
 * a compose box — so this stays deliberately small and standards-adjacent.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Only push external value in when it genuinely differs, otherwise every keystroke would
  // rewrite innerHTML and throw the caret back to the start of the box.
  useEffect(() => {
    const el = ref.current;
    if (el && value !== el.innerHTML) {
      el.innerHTML = value;
      setIsEmpty(!el.textContent?.trim());
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsEmpty(!el.textContent?.trim() && !el.querySelector("img"));
    onChange(el.innerHTML);
  }, [onChange]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      ref.current?.focus();
      document.execCommand(command, false, arg);
      sync();
    },
    [sync]
  );

  function insertLink() {
    const url = window.prompt("Link URL");
    if (!url) return;
    // Default to https so a bare "example.com" doesn't become a broken relative link.
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec("createLink", href);
  }

  return (
    <div className="flex flex-col">
      {/* Placeholder is an overlay rather than CSS :empty — a contentEditable that looks empty
          usually still contains a stray <br>, so :empty never matches once it's been focused. */}
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={sync}
          className="outline-none text-[13.5px] leading-relaxed text-[var(--ink)] px-1 py-1 overflow-y-auto"
          style={{ minHeight }}
        />
        {isEmpty && placeholder && (
          <div className="absolute left-1 top-1 pointer-events-none select-none text-[13.5px] text-[var(--muted-2)]">
            {placeholder}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 flex-wrap pt-2 mt-2 border-t border-[var(--border)]">
        <ToolButton label="Undo" onClick={() => exec("undo")}><Undo2 size={14} /></ToolButton>
        <ToolButton label="Redo" onClick={() => exec("redo")}><Redo2 size={14} /></ToolButton>
        <Divider />
        <ToolButton label="Bold" onClick={() => exec("bold")}><Bold size={14} /></ToolButton>
        <ToolButton label="Italic" onClick={() => exec("italic")}><Italic size={14} /></ToolButton>
        <ToolButton label="Underline" onClick={() => exec("underline")}><Underline size={14} /></ToolButton>
        <ToolButton label="Strikethrough" onClick={() => exec("strikeThrough")}><Strikethrough size={14} /></ToolButton>
        <Divider />
        <ToolButton label="Bulleted list" onClick={() => exec("insertUnorderedList")}><List size={14} /></ToolButton>
        <ToolButton label="Numbered list" onClick={() => exec("insertOrderedList")}><ListOrdered size={14} /></ToolButton>
        <ToolButton label="Indent" onClick={() => exec("indent")}><IndentIncrease size={14} /></ToolButton>
        <ToolButton label="Outdent" onClick={() => exec("outdent")}><IndentDecrease size={14} /></ToolButton>
        <ToolButton label="Quote" onClick={() => exec("formatBlock", "blockquote")}><Quote size={14} /></ToolButton>
        <Divider />
        <ToolButton label="Align left" onClick={() => exec("justifyLeft")}><AlignLeft size={14} /></ToolButton>
        <ToolButton label="Align centre" onClick={() => exec("justifyCenter")}><AlignCenter size={14} /></ToolButton>
        <ToolButton label="Align right" onClick={() => exec("justifyRight")}><AlignRight size={14} /></ToolButton>
        <Divider />
        <ToolButton label="Insert link" onClick={insertLink}><Link2 size={14} /></ToolButton>
        <ToolButton label="Clear formatting" onClick={() => exec("removeFormat")}><RemoveFormatting size={14} /></ToolButton>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="w-px h-4 mx-1" style={{ background: "var(--border)" }} />;
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Mousedown rather than click: clicking would blur the editor first and collapse the
      // selection, so formatting would apply to nothing.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="p-1.5 rounded text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
    >
      {children}
    </button>
  );
}
