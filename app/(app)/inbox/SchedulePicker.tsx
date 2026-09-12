"use client";

import { useState } from "react";
import { Send, ChevronDown, Loader2, Clock } from "lucide-react";

/** Rounds up to the next :00 or :30 — quick-pick times land on a clean slot instead of whatever
 * minute the button happened to be clicked at, same as Gmail's own schedule-send menu. */
function nextHalfHour(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const mins = r.getMinutes();
  r.setMinutes(mins <= 30 ? 30 : 60);
  return r;
}

function atTime(d: Date, hours: number, minutes = 0): Date {
  const r = new Date(d);
  r.setHours(hours, minutes, 0, 0);
  return r;
}

function nextMonday(d: Date): Date {
  const r = new Date(d);
  const daysUntilMonday = (8 - r.getDay()) % 7 || 7;
  r.setDate(r.getDate() + daysUntilMonday);
  return atTime(r, 8);
}

function quickOptions(): { label: string; date: Date }[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const later = nextHalfHour(new Date(now.getTime() + 60 * 60 * 1000));

  return [
    { label: `Later today, ${later.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, date: later },
    { label: "Tomorrow morning, 8:00 AM", date: atTime(tomorrow, 8) },
    { label: "Tomorrow afternoon, 1:00 PM", date: atTime(tomorrow, 13) },
    { label: `Monday morning, 8:00 AM`, date: nextMonday(now) },
  ].filter((o) => o.date.getTime() > now.getTime() + 60_000);
}

/** "YYYY-MM-DDTHH:mm" in local time, what <input type="datetime-local"> needs. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Gmail's split Send button: the main action sends right away, the chevron opens "Schedule send"
 * with the same quick-pick times Gmail offers plus a custom date/time. Picking one doesn't send or
 * schedule directly — it hands the chosen instant to the caller, which shows the full preview
 * before anything actually goes out (see EmailPreviewModal). That's the point of asking for a time
 * here rather than just queuing it: the preview is where the send actually happens.
 */
export default function SchedulePicker({
  disabled,
  sending,
  onSendNow,
  onPickTime,
}: {
  disabled: boolean;
  sending: boolean;
  onSendNow: () => void;
  onPickTime: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const minLocal = toLocalInputValue(new Date());

  function pick(date: Date) {
    setOpen(false);
    setCustomOpen(false);
    onPickTime(date);
  }

  return (
    <div className="relative inline-flex">
      <button
        onClick={onSendNow}
        disabled={disabled}
        className="btn-primary inline-flex items-center gap-1.5 pl-5 pr-3 py-2 text-sm rounded-r-none disabled:opacity-50"
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {sending ? "Sending…" : "Send"}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Schedule send"
        title="Schedule send"
        className="btn-primary rounded-l-none border-l border-black/10 px-2 py-2 disabled:opacity-50"
      >
        <ChevronDown size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full left-0 mb-1 z-20 w-64 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {!customOpen ? (
              <>
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-2)]">Schedule send</div>
                {quickOptions().map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => pick(o.date)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-[var(--bg)] text-[var(--ink)]"
                  >
                    <Clock size={13} className="text-[var(--muted-2)]" /> {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCustomValue(toLocalInputValue(nextHalfHour(new Date(Date.now() + 60 * 60 * 1000))));
                    setCustomOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-[var(--bg)] border-t border-[var(--border)] mt-1 pt-2 text-[var(--ink)]"
                >
                  <Clock size={13} className="text-[var(--muted-2)]" /> Pick date &amp; time
                </button>
              </>
            ) : (
              <div className="px-3 py-1 space-y-2">
                <input
                  type="datetime-local"
                  className="input py-1.5 text-[13px]"
                  value={customValue}
                  min={minLocal}
                  onChange={(e) => setCustomValue(e.target.value)}
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!customValue}
                    onClick={() => pick(new Date(customValue))}
                    className="btn-primary flex-1 py-1.5 text-xs disabled:opacity-50"
                  >
                    Preview &amp; schedule
                  </button>
                  <button type="button" onClick={() => setCustomOpen(false)} className="btn-secondary py-1.5 px-2.5 text-xs">
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
