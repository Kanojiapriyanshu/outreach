"use client";

import { useEffect, useState } from "react";
import { X, Minus, Maximize2, Minimize2, Trash2 } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { useAttachments, AttachmentList, TemplatePicker, templateToHtml } from "./composerParts";
import ClassificationPicker, { effectiveClassification, type ClassificationChoice } from "./ClassificationPicker";
import SchedulePicker from "./SchedulePicker";
import EmailPreviewModal from "./EmailPreviewModal";
import type { OutboundGuess } from "@/lib/outboundClassifier";
import type { ComposeEmailInput } from "@/lib/trackSequence";

function labelForPreview(c: ClassificationChoice): string {
  if (c.outreachType === "CREATOR") return "Creator outreach";
  if (c.outreachType === "BRAND") return c.recipientType === "AGENCY" ? "Agency outreach" : "Brand outreach";
  return "Just an email — no follow-up";
}

/** Lets a caller other than "start blank" open Compose already knowing who this is for — Creator
 * Discovery's Start Outreach button is the first one to use this, but nothing about it is
 * Discovery-specific. Skips the async classification guess entirely when `classification` is set:
 * a caller that already knows for certain shouldn't get second-guessed by a heuristic. */
export interface ComposePrefill {
  to?: string;
  contactName?: string;
  companyName?: string;
  classification?: ClassificationChoice;
  channelName?: string;
  channelUrl?: string;
  niche?: string;
  subject?: string;
  /** Set when the caller has no email for this person — a page where the team can look it up
   * (a creator's YouTube About page). Shown as a hint until something is typed into To. */
  emailLookupUrl?: string;
  /** A creator's channel link — the influencer Email 1 is filled in from that channel on open. */
  personalizeChannelUrl?: string;
}

export default function ComposeWindow({
  onClose,
  onSent,
  initial,
}: {
  onClose: () => void;
  onSent: () => void;
  initial?: ComposePrefill;
}) {
  const [minimized, setMinimized] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const [to, setTo] = useState(initial?.to ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [html, setHtml] = useState("");
  // No clear() needed here: discarding closes the whole window, which unmounts this state.
  const { attachments, removeAt, totalBytes, AttachButton } = useAttachments();

  // --- Who this is actually for, and whether that means follow-ups (see lib/outboundClassifier.ts) ---
  const [autoGuess, setAutoGuess] = useState<OutboundGuess | null>(null);
  const [classificationOverride, setClassificationOverride] = useState<ClassificationChoice | null>(initial?.classification ?? null);
  const [contactName, setContactName] = useState(initial?.contactName ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const classification = effectiveClassification(autoGuess, classificationOverride);

  // Re-guesses on a short pause after the recipient/subject/body change — cheap (keyword scoring
  // plus one indexed lookup), so debouncing is just about not firing on every keystroke rather
  // than about cost. Stops once the team has picked something by hand (including a classification
  // this window was opened already knowing, per `initial` above) — their choice shouldn't flicker
  // back to "auto" just because they kept typing the email.
  useEffect(() => {
    if (!to.trim() || classificationOverride) return;
    const timeout = setTimeout(() => {
      fetch("/api/inbox/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, html }),
      })
        .then((r) => r.json())
        .then((data) => setAutoGuess(data.guess ?? null))
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, html, classificationOverride]);

  // Opened for a creator: write Email 1 from their channel instead of starting blank. Only fills
  // what the team hasn't touched yet, so typing while it loads is never overwritten.
  const [personalizing, setPersonalizing] = useState(!!initial?.personalizeChannelUrl);
  const [personalizeNote, setPersonalizeNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => {
    const channelUrl = initial?.personalizeChannelUrl;
    if (!channelUrl) return;
    let cancelled = false;
    fetch("/api/influencers/personalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelUrl }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error ?? "Couldn't read their channel");
        const draft = data.draft as { subject: string; body: string; email: string | null; topics: { phrase: string }[] };
        setSubject((prev) => (prev === (initial?.subject ?? "") ? draft.subject : prev));
        setHtml((prev) => (prev.replace(/<[^>]*>/g, "").trim() ? prev : templateToHtml(draft.body)));
        if (draft.email) setTo((prev) => (prev.trim() ? prev : draft.email!));
        setPersonalizeNote({
          tone: "ok",
          text:
            draft.topics.length > 0
              ? `Filled in from their recent uploads (${draft.topics.map((t) => t.phrase).join(", ")}) — edit anything before sending.`
              : "Filled in from their channel — no clear recurring topic, so check the highlighted phrase.",
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setPersonalizeNote({ tone: "error", text: `${err instanceof Error ? err.message : "Couldn't read their channel"} — load the template below instead.` });
      })
      .finally(() => {
        if (!cancelled) setPersonalizing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the channel this window opened with
  }, []);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A time picked from SchedulePicker doesn't schedule anything by itself — it opens the preview
  // below, and scheduling only actually happens if that's confirmed there.
  const [pendingScheduleAt, setPendingScheduleAt] = useState<Date | null>(null);

  function validateRecipient(): string | null {
    if (!to.trim()) return "Add at least one recipient";
    const addresses = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (classification.outreachType && addresses.length > 1) {
      return "Outreach emails can only go to one person — remove the extra recipients, or switch to \"Just an email\" above.";
    }
    if (classification.outreachType && !contactName.trim()) {
      return "Add their name — the CRM needs it to track this outreach.";
    }
    if (classification.outreachType === "BRAND" && !companyName.trim()) {
      return classification.recipientType === "AGENCY" ? "Add the agency's name" : "Add the brand or company name";
    }
    return null;
  }

  /** Builds the one request body shared by immediate send and scheduled send for whichever path
   * the classification points at — only the endpoint and whether `scheduledAt` is set differ. */
  // Same shape /api/sequences/compose expects, except emailAccountId is optional here — the
  // inbox Compose window has no account picker, so the route resolves the connected account
  // itself when this is left out (see that route's handling of a missing emailAccountId).
  type ComposeRequestBody = Omit<ComposeEmailInput, "emailAccountId"> & { emailAccountId?: string; scheduledAt?: string };

  function buildRequest(scheduledAt?: Date) {
    if (classification.outreachType) {
      // Typed against the real backend input so a renamed/mistyped field here is a build error,
      // not a silently-ignored one — e.g. this used to send `subject` instead of
      // `templateOverrideSubject`, which composeAndSendInitialEmail simply doesn't read.
      const body: ComposeRequestBody = {
        outreachType: classification.outreachType,
        recipientType: classification.outreachType === "BRAND" ? classification.recipientType : undefined,
        contactEmail: to.trim(),
        contactName: contactName.trim(),
        brand: classification.outreachType === "BRAND" ? { name: companyName.trim() } : undefined,
        creator:
          classification.outreachType === "CREATOR"
            ? { name: contactName.trim(), channelName: initial?.channelName, channelUrl: initial?.channelUrl, niche: initial?.niche }
            : undefined,
        variables: {},
        html,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        templateOverrideSubject: subject.trim() || "(no subject)",
        attachments: attachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
        scheduledAt: scheduledAt?.toISOString(),
      };
      return { url: "/api/sequences/compose", body };
    }
    return {
      url: "/api/inbox/send",
      body: {
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim(),
        html,
        attachments: attachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
        scheduledAt: scheduledAt?.toISOString(),
      },
    };
  }

  async function submit(scheduledAt?: Date) {
    const { url, body } = buildRequest(scheduledAt);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't send that");
    return data;
  }

  /** A template loaded into the editor keeps its {Tags} until someone replaces them — sent as-is,
   * an influencer would literally read "your {Content_Highlights}". Asks before that goes out. */
  function confirmUnfilledTags(): boolean {
    const tags = [...new Set([...`${subject} ${html}`.matchAll(/\{([A-Za-z_]+)\}/g)].map((m) => `{${m[1]}}`))];
    if (tags.length === 0) return true;
    return confirm(`This email still contains ${tags.join(", ")} — that text will be sent exactly as written. Send anyway?`);
  }

  async function sendNow() {
    const validationError = validateRecipient();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!confirmUnfilledTags()) return;
    setSending(true);
    setError(null);
    try {
      await submit();
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  function openSchedulePreview(date: Date) {
    const validationError = validateRecipient();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!confirmUnfilledTags()) return;
    setError(null);
    setPendingScheduleAt(date);
  }

  async function confirmSchedule() {
    if (!pendingScheduleAt) return;
    await submit(pendingScheduleAt);
    setPendingScheduleAt(null);
    onSent();
    onClose();
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
      {pendingScheduleAt && (
        <EmailPreviewModal
          fromEmail={null}
          to={to.trim()}
          cc={cc.trim() || undefined}
          bcc={bcc.trim() || undefined}
          subject={subject.trim() || "(no subject)"}
          html={html}
          attachments={attachments}
          scheduledAt={pendingScheduleAt}
          classificationLabel={labelForPreview(classification)}
          onEdit={() => setPendingScheduleAt(null)}
          onConfirm={confirmSchedule}
        />
      )}

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
        {initial?.emailLookupUrl && !to.trim() && (
          <div className="mt-2.5 rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
            No public email was found in this channel&apos;s description. YouTube keeps most business emails behind the
            &ldquo;View email address&rdquo; button —{" "}
            <a href={initial.emailLookupUrl} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
              open their About page
            </a>
            , copy the email, and paste it into To below. It&apos;s saved to this creator once you send.
          </div>
        )}

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

        {to.trim() && (
          <ClassificationPicker
            guess={autoGuess}
            override={classificationOverride}
            onOverride={setClassificationOverride}
            contactName={contactName}
            onContactNameChange={setContactName}
            companyName={companyName}
            onCompanyNameChange={setCompanyName}
          />
        )}

        {/* Templates — the CRM already has the team's approved copy, so composing from it beats
            retyping it or pasting from somewhere else. */}
        {(personalizing || personalizeNote) && (
          <p
            className="pt-2 text-xs flex items-center gap-1.5"
            style={{ color: personalizeNote?.tone === "error" ? "var(--danger-fg)" : "var(--muted)" }}
          >
            {personalizing ? "Writing this from their channel…" : personalizeNote?.text}
          </p>
        )}

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
        <SchedulePicker disabled={sending || !to.trim()} sending={sending} onSendNow={sendNow} onPickTime={openSchedulePreview} />

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
