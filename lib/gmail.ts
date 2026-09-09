import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    // Just "consent" — a combined "consent select_account" value reproducibly broke Google's
    // sign-in step with a generic malformed-request error (google-auth-library likely doesn't
    // handle a space-delimited multi-value prompt correctly when building the URL). To connect
    // a different Google account, sign out of Google (or use an incognito window) before
    // clicking Connect — Google will then prompt for which account to use naturally.
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/** Returns an authenticated Gmail client for a stored EmailAccount, refreshing tokens if needed. */
export async function gmailClientFor(emailAccountId: string): Promise<gmail_v1.Gmail> {
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
  });

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: account.accessToken ?? undefined,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.tokenExpiry?.getTime(),
  });

  oauth2Client.on("tokens", async (tokens) => {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        accessToken: tokens.access_token ?? account.accessToken,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : account.tokenExpiry,
        accessStatus: "CONNECTED",
      },
    });
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

function decodeHeaderValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export interface ThreadSummary {
  threadId: string;
  messages: {
    id: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    autoSubmitted: string;
    snippet: string;
  }[];
}

/** Fetches a thread and its message headers for reply/bounce/auto-reply classification. */
export async function getThreadSummary(
  gmail: gmail_v1.Gmail,
  threadId: string
): Promise<ThreadSummary> {
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Subject", "Date", "Auto-Submitted", "X-Autoreply"],
  });

  const messages = (res.data.messages ?? []).map((m) => ({
    id: m.id!,
    from: decodeHeaderValue(m.payload?.headers, "From"),
    to: decodeHeaderValue(m.payload?.headers, "To"),
    subject: decodeHeaderValue(m.payload?.headers, "Subject"),
    date: decodeHeaderValue(m.payload?.headers, "Date"),
    autoSubmitted:
      decodeHeaderValue(m.payload?.headers, "Auto-Submitted") ||
      decodeHeaderValue(m.payload?.headers, "X-Autoreply"),
    snippet: m.snippet ?? "",
  }));

  return { threadId, messages };
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

/** Strips tags/entities from an HTML body down to readable plain text — good enough for feeding an
 * extractor, not for display. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Walks a message payload's MIME tree for the best plain-text rendering: prefers text/plain,
 * falls back to text/html stripped down to text if that's all there is. */
function extractPlainTextFromPayload(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  let plainPart: string | null = null;
  let htmlPart: string | null = null;

  function walk(part: gmail_v1.Schema$MessagePart) {
    const data = part.body?.data;
    if (part.mimeType === "text/plain" && data && plainPart === null) {
      plainPart = base64UrlDecode(data);
    } else if (part.mimeType === "text/html" && data && htmlPart === null) {
      htmlPart = base64UrlDecode(data);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);

  if (plainPart !== null) return (plainPart as string).trim();
  if (htmlPart !== null) return htmlToPlainText(htmlPart as string);
  return "";
}

// Common client-generated quote-intro headers ("On Mon, Sep 2, 2026 at 4:29 PM Fidem Growth
// <x@y.com> wrote:", the Outlook-style "From:/Sent:/To:/Subject:" block). English-only and easy
// to dodge (Gmail localizes "wrote:" per the sender's own language, and wraps long lines) so
// this is just a bonus catch — the ">"-prefixed blockquote pattern below is what actually holds
// across locales, since that quoting convention itself isn't translated.
const QUOTE_HEADER_PATTERNS = [/^On .{0,120}wrote:\s*$/im, /^-{2,}\s*Original Message\s*-{2,}$/im, /^From:\s.+$/im];
// The first line of the quoted reply chain itself, in any language a client localizes "wrote:"
// into — reliable because the ">" convention is added by the client, not translated text.
const BLOCKQUOTE_LINE = /^\s*>/m;

/** Trims a message body down to just the new content, dropping the quoted reply chain below it. */
function stripQuotedReply(text: string): string {
  let cut = text.length;
  for (const pattern of [...QUOTE_HEADER_PATTERNS, BLOCKQUOTE_LINE]) {
    const match = text.match(pattern);
    if (match?.index != null && match.index < cut) cut = match.index;
  }
  return text.slice(0, cut).trim();
}

export interface ThreadMessageText {
  id: string;
  from: string;
  date: string;
  subject: string;
  text: string;
}

/**
 * Fetches every message in a thread with its actual body text (not just headers/snippet) —
 * used to auto-fill the "Tell Us About Them" form from whatever's already in the thread
 * instead of asking the team to paste it in by hand.
 */
export async function getThreadFullText(gmail: gmail_v1.Gmail, threadId: string): Promise<ThreadMessageText[]> {
  const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const messages = res.data.messages ?? [];
  return messages.map((m) => ({
    id: m.id!,
    from: decodeHeaderValue(m.payload?.headers, "From"),
    date: decodeHeaderValue(m.payload?.headers, "Date"),
    subject: decodeHeaderValue(m.payload?.headers, "Subject"),
    text: stripQuotedReply(extractPlainTextFromPayload(m.payload)).slice(0, 4000),
  }));
}

/** Searches the account's Sent mail for a message to `toEmail`, most recent first. */
export async function findSentThreadTo(gmail: gmail_v1.Gmail, toEmail: string) {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: `in:sent to:${toEmail}`,
    maxResults: 10,
  });
  const items = res.data.messages ?? [];
  const results: { messageId: string; threadId: string; subject: string; date: string }[] = [];
  for (const item of items) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: item.id!,
      format: "metadata",
      metadataHeaders: ["Subject", "Date", "Message-Id"],
    });
    results.push({
      messageId: item.id!,
      threadId: msg.data.threadId!,
      subject: decodeHeaderValue(msg.data.payload?.headers, "Subject"),
      date: decodeHeaderValue(msg.data.payload?.headers, "Date"),
    });
  }
  return results;
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Email headers are technically 7-bit ASCII (RFC 5322) — raw UTF-8 bytes dropped straight into a
 * header (subjects with "×"/"—"/etc.) get misread as Latin-1 by some clients and show up as
 * mojibake ("HBADA Ã— Fidem..."). Non-ASCII header values need RFC 2047 "encoded word" wrapping;
 * a pure-ASCII value is left untouched (needlessly encoding it would just be noise).
 */
function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/**
 * RFC 5322 requires CRLF line endings throughout the whole message. The headers were joined with
 * "\r\n" but the body text (JS template literals only ever produce bare "\n") wasn't normalized to
 * match — some mail clients then collapse the single-LF paragraph breaks, rendering the email as
 * one run-on wall of text. Normalize first (handles \r\n already present without doubling it up).
 */
function toCrlf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turns bare URLs and email addresses into clickable links. Runs on already-HTML-escaped text. */
function linkify(s: string): string {
  return s
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
}

/**
 * Converts the plain-text body into real HTML paragraphs. Gmail's own plain-text renderer
 * reflows long unbroken lines using a fixed-width algorithm that ignores the actual viewport —
 * verified by pulling the raw sent message straight from the Gmail API: the transmitted content
 * has zero embedded line breaks within a paragraph, yet the reading pane still shows the same
 * short, mid-sentence line breaks on every device. Real `<p>` block elements sidestep that
 * ambiguity entirely — the browser/app's own CSS reflows them properly, the same way any web
 * page's paragraph text does.
 */
function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((para) => linkify(escapeHtml(para.trim())).replace(/\n/g, "<br>"))
    .filter((p) => p.length > 0);
  const body = paragraphs.map((p) => `<p style="margin:0 0 1em 0;">${p}</p>`).join("\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202124;line-height:1.5;">\n${body}\n</div>`;
}

/**
 * Builds a multipart/alternative raw RFC 5322 message — a text/plain part (fallback for clients
 * that don't render HTML) plus a text/html part (what most clients, Gmail included, actually
 * display). Sending HTML avoids the plain-text reflow issue described in textToHtml() above.
 */
function buildMultipartRaw(headerLines: string[], body: string): string {
  const boundary = `----=_FidemGrowth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const plainPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    toCrlf(body),
  ].join("\r\n");
  const htmlPart = [
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    toCrlf(textToHtml(body)),
  ].join("\r\n");

  return [
    ...headerLines,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "MIME-Version: 1.0",
    "",
    plainPart,
    htmlPart,
    `--${boundary}--`,
  ].join("\r\n");
}

/** Sends a brand-new Email 1 (no thread yet) directly from the CRM via the connected Gmail account. */
export async function sendInitialEmail(
  gmail: gmail_v1.Gmail,
  params: { to: string; subject: string; body: string; fromEmail: string }
) {
  const raw = buildMultipartRaw(
    [`From: ${params.fromEmail}`, `To: ${params.to}`, `Subject: ${encodeHeaderValue(params.subject)}`],
    params.body
  );

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: base64UrlEncode(raw) },
  });

  return res.data; // { id, threadId, ... }
}

/** Sends a follow-up in an existing thread, preserving In-Reply-To/References for correct threading. */
export async function sendFollowUpEmail(
  gmail: gmail_v1.Gmail,
  params: {
    to: string;
    subject: string;
    body: string;
    threadId: string;
    inReplyToRfc822MessageId: string;
    references: string;
    fromEmail: string;
  }
) {
  const raw = buildMultipartRaw(
    [
      `From: ${params.fromEmail}`,
      `To: ${params.to}`,
      `Subject: ${encodeHeaderValue(params.subject)}`,
      `In-Reply-To: ${params.inReplyToRfc822MessageId}`,
      `References: ${params.references}`,
    ],
    params.body
  );

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: params.threadId,
      raw: base64UrlEncode(raw),
    },
  });

  return res.data;
}

/** Fetches the RFC822 Message-Id header of a message (needed for In-Reply-To/References). */
export async function getRfc822MessageId(gmail: gmail_v1.Gmail, messageId: string) {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Message-Id", "References"],
  });
  return {
    messageId: decodeHeaderValue(res.data.payload?.headers, "Message-Id"),
    references: decodeHeaderValue(res.data.payload?.headers, "References"),
  };
}

const MAILER_DAEMON_PATTERNS = [/mailer-daemon/i, /postmaster/i, /bounce/i];
const BOUNCE_SUBJECT_PATTERNS = [
  /undelivered mail/i,
  /delivery status notification/i,
  /returned to sender/i,
  /mail delivery failed/i,
];

export function looksLikeBounce(msg: { from: string; subject: string }): boolean {
  return (
    MAILER_DAEMON_PATTERNS.some((p) => p.test(msg.from)) ||
    BOUNCE_SUBJECT_PATTERNS.some((p) => p.test(msg.subject))
  );
}

export function looksLikeAutoReply(msg: { autoSubmitted: string; subject: string }): boolean {
  if (msg.autoSubmitted && !/^no$/i.test(msg.autoSubmitted.trim())) return true;
  return /out of office|automatic reply|auto-reply/i.test(msg.subject);
}
