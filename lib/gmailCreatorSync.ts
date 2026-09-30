import "server-only";
import { prisma } from "@/lib/prisma";
import { gmailClientFor, getThreadFullText, listThreadIds, parseFromHeader } from "@/lib/gmail";
import { analyzeCreatorReply } from "@/lib/creatorReplyAI";
import { formatRate, mergeRates, primaryRate, type CreatorReplyAnalysis, type CreatorReplyIntent, type QuotedRate } from "@/lib/creatorReplyAnalysis";
import { isTrackingNotification } from "@/lib/trackingSenders";
import { classifyConversation } from "@/lib/gmailConversationAI";
import { syncCreatorRateFromSequence, requestCreatorMediaKit } from "@/lib/creatorProfileSync";
import { refreshCreator } from "@/lib/youtube/discoveryEngine";
import { youtubeGet } from "@/lib/youtube/api";

/**
 * Brings creator conversations the team started straight from Gmail into the system: finds
 * threads where we emailed a creator first and they answered, reads the reply with the same
 * analyzer the worker uses (rate, interest, decline), and — once the team has reviewed the list —
 * adds each as a tracked creator outreach.
 *
 * Importing never sends or schedules anything. The sequence is created already "replied", with no
 * follow-up queued; from then on the worker only watches the thread for new messages, exactly as
 * it does for a creator pitched from the app.
 */

const MAX_THREADS = 100;
const FETCH_CONCURRENCY = 8;
const FREE_MAIL = /@(?:gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton(?:mail)?|qq|163|126)\./i;
const YOUTUBE_RE = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[\w.\-]+|channel\/UC[\w-]{22}|c\/[\w.\-]+)/i;

export interface GmailCreatorCandidate {
  gmailThreadId: string;
  subject: string;
  contactName: string;
  contactEmail: string;
  firstSentAt: string;
  lastReplyAt: string;
  /** Their latest message, quoted replies stripped. */
  replyText: string;
  intent: CreatorReplyIntent;
  rates: QuotedRate[];
  rateNote: string | null;
  /** A YouTube channel link found anywhere in the conversation, if any. */
  channelUrl: string | null;
  /** The roster creator this conversation belongs to, when one could be matched. */
  match: { creatorId: string; name: string; hasRate: boolean } | null;
  /** Creator / channel name as the conversation names them — suggested for a new roster row. */
  suggestedName: string;
  /** One-line summary of their reply (AI only). */
  summary: string | null;
  messageCount: number;
}

type Msg = { id: string; from: string; date: string; subject: string; text: string };

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function channelUrlIn(texts: string[]): string | null {
  for (const text of texts) {
    const m = YOUTUBE_RE.exec(text);
    if (m) return `https://www.youtube.com/${m[1]}`;
  }
  return null;
}

/**
 * Who we pitched, from our own first email: the "Fidem Growth × Cozy K — …" subject, else the
 * "Hi BoxDesire," greeting. Replies often come from a manager or agency, so the sender's name
 * isn't the creator's.
 */
export function creatorNameFromPitch(subject: string, firstEmail: string): string {
  const bySubject = /fidem growth\s*[×x]\s*([^—–|-]+?)\s*(?:[—–|-]|$)/i.exec(subject)?.[1]?.trim();
  if (bySubject) return bySubject.replace(/paid$/i, "").trim();
  const greeting = /^\s*(?:hi|hello|hey)\s+([^,\n]{2,40}),/i.exec(firstEmail)?.[1]?.trim();
  return greeting && !/team$/i.test(greeting) ? greeting : "";
}

/** Latest reply decides the status (a "we'll pass" after quoting rates is a pass); rates come
 * from everything they wrote. */
function combineAnalyses(latest: CreatorReplyAnalysis, all: CreatorReplyAnalysis): CreatorReplyAnalysis {
  if (latest.intent === "OPT_OUT" || latest.intent === "UNINTERESTED") return { ...latest, rates: all.rates };
  if (all.rates.length > 0 || all.intent === "RATE_SHARED") return { ...all, intent: "RATE_SHARED", summary: latest.summary ?? all.summary };
  return { ...latest, rates: all.rates, rateNote: latest.rateNote ?? all.rateNote };
}

async function analyzeThread(theirs: Msg[], ours: string[]): Promise<CreatorReplyAnalysis> {
  const [latest, all] = await Promise.all([
    analyzeCreatorReply(theirs[theirs.length - 1].text, { sentBodies: ours }),
    theirs.length > 1 ? analyzeCreatorReply(theirs.map((m) => m.text).join("\n\n"), { sentBodies: ours }) : null,
  ]);
  return all ? combineAnalyses(latest, all) : latest;
}

function toDate(raw: string): Date {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function matchCreator(email: string, channelUrl: string | null, name = "") {
  const contact = await prisma.contact.findFirst({ where: { email, creatorId: { not: null } }, select: { creator: { select: { id: true, name: true, channelName: true, quotedRateAt: true } } } });
  if (contact?.creator) return contact.creator;
  const handle = channelUrl ? /\/(@[\w.\-]+|channel\/UC[\w-]{22})/.exec(channelUrl)?.[1] : null;
  const clean = name.trim();
  // adam@keoprints.com → "Keo Prints": a creator's own domain usually is their channel name.
  const domainLabel = /@([^.]+)\./.exec(email)?.[1] ?? "";
  if (domainLabel.length >= 4 && !FREE_MAIL.test(email)) {
    const squash = (v: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const near = await prisma.creator.findMany({
      where: { channelName: { contains: domainLabel.slice(0, 3), mode: "insensitive" } },
      select: { id: true, name: true, channelName: true, quotedRateAt: true },
      take: 50,
    });
    const hit = near.find((c) => squash(c.channelName) === domainLabel.toLowerCase() || squash(c.name) === domainLabel.toLowerCase());
    if (hit) return hit;
  }
  return prisma.creator.findFirst({
    where: {
      OR: [
        { email },
        ...(handle ? [{ channelUrl: { contains: handle, mode: "insensitive" as const } }, { channelId: handle.replace(/^channel\//, "") }] : []),
        ...(clean.length >= 3 ? [{ channelName: { equals: clean, mode: "insensitive" as const } }, { name: { equals: clean, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, name: true, channelName: true, quotedRateAt: true },
  });
}

/**
 * Finds creator conversations from the last `days` days that were started from Gmail and aren't
 * tracked yet: Claude tells creator outreach apart from brand pitches (keywords can't — Fidem's
 * brand emails talk about creators too), then the reply reader pulls out the rate or interest.
 */
export async function scanGmailForCreatorReplies(emailAccountId: string, days: number): Promise<GmailCreatorCandidate[]> {
  const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: emailAccountId }, select: { email: true } });
  const me = account.email.toLowerCase();
  const gmail = await gmailClientFor(emailAccountId);

  // "-from:me" matches threads with at least one message from someone else in the window — so a
  // creator's reply is found even after the thread was archived out of the inbox.
  const threadIds = await listThreadIds(
    gmail,
    `newer_than:${Math.max(1, Math.min(60, days))}d -from:me -category:promotions -category:social -category:updates -category:forums`,
    MAX_THREADS
  );
  const tracked = new Set(
    (await prisma.outreachSequence.findMany({ where: { emailAccountId, threadId: { in: threadIds } }, select: { threadId: true } })).map((s) => s.threadId)
  );

  const threads = await mapLimit(
    threadIds.filter((id) => !tracked.has(id)),
    FETCH_CONCURRENCY,
    async (id) => ({
      id,
      messages: ((await getThreadFullText(gmail, id).catch(() => [])) as Msg[]).filter((m) => !isTrackingNotification(parseFromHeader(m.from).address)),
    })
  );

  // People already tracked as a brand contact are never creators.
  const brandEmails = new Set(
    (await prisma.contact.findMany({ where: { brandId: { not: null } }, select: { email: true } })).map((c) => c.email.toLowerCase())
  );

  // Cheap filters first: we started it, a real person answered, and they're not a known brand.
  const conversations = threads.flatMap(({ id, messages }) => {
    if (messages.length < 2) return [];
    const fromMe = (m: Msg) => parseFromHeader(m.from).address.toLowerCase() === me;
    if (!fromMe(messages[0])) return [];
    const theirs = messages.filter((m) => !fromMe(m));
    if (theirs.length === 0) return [];
    const latest = theirs[theirs.length - 1];
    if (brandEmails.has(parseFromHeader(latest.from).address.toLowerCase())) return [];
    return [{ id, messages, theirs, ours: messages.filter(fromMe).map((m) => m.text), latest }];
  });

  const read = await mapLimit(conversations, FETCH_CONCURRENCY, async (c) => {
    const first = c.messages[0];
    const kind = await classifyConversation({ subject: first.subject, firstEmail: first.text, reply: c.latest.text });
    if (kind.kind !== "creator") return null;
    const analysis = await analyzeThread(c.theirs, c.ours);
    if (analysis.intent === "AUTO_REPLY") return null;
    return { c, kind, analysis };
  });

  const candidates: GmailCreatorCandidate[] = [];
  for (const hit of read) {
    if (!hit) continue;
    const { c, kind, analysis } = hit;
    const first = c.messages[0];
    const sender = parseFromHeader(c.latest.from);
    const channelUrl = kind.channelUrl || channelUrlIn([...c.theirs.map((m) => m.text), ...c.ours]);
    const pitchedName = kind.creatorName || creatorNameFromPitch(first.subject, first.text);
    const match = await matchCreator(sender.address.toLowerCase(), channelUrl, pitchedName);
    candidates.push({
      gmailThreadId: c.id,
      subject: first.subject,
      contactName: sender.name || sender.address,
      contactEmail: sender.address.toLowerCase(),
      firstSentAt: toDate(first.date).toISOString(),
      lastReplyAt: toDate(c.latest.date).toISOString(),
      replyText: c.latest.text.slice(0, 1500),
      intent: analysis.intent,
      rates: analysis.rates,
      rateNote: analysis.rateNote,
      channelUrl,
      match: match ? { creatorId: match.id, name: match.channelName ?? match.name, hasRate: !!match.quotedRateAt } : null,
      suggestedName: pitchedName || sender.name || sender.address,
      summary: analysis.summary,
      messageCount: c.messages.length,
    });
  }

  return candidates.sort((a, b) => b.lastReplyAt.localeCompare(a.lastReplyAt));
}

export interface ImportSelection {
  gmailThreadId: string;
  /** Creator name to use when a new roster row is created. */
  creatorName: string;
  /** Optional channel link the team pasted in during review. */
  channelUrl?: string | null;
}

export type ImportResult =
  | { gmailThreadId: string; ok: true; creatorId: string; created: boolean; stage: string; summary: string }
  | { gmailThreadId: string; ok: false; error: string };

async function resolveChannelId(url: string): Promise<string | null> {
  const direct = /channel\/(UC[\w-]{22})/.exec(url)?.[1];
  if (direct) return direct;
  const handle = /\/(@[\w.\-]+)/.exec(url)?.[1];
  if (!handle) return null;
  const res = await youtubeGet<{ items?: { id: string }[] }>("channels", { part: "id", forHandle: handle });
  return res.items?.[0]?.id ?? null;
}

const STAGE_FOR: Partial<Record<CreatorReplyIntent, "RATE_RECEIVED" | "INTERESTED" | "NOT_INTERESTED">> = {
  RATE_SHARED: "RATE_RECEIVED",
  INTERESTED: "INTERESTED",
  HUMAN_REPLY: "INTERESTED",
  UNINTERESTED: "NOT_INTERESTED",
  OPT_OUT: "NOT_INTERESTED",
};

/** Adds one reviewed conversation to the system. Idempotent per thread. */
export async function importGmailCreatorThread(emailAccountId: string, sel: ImportSelection): Promise<ImportResult> {
  const { gmailThreadId } = sel;
  try {
    const existing = await prisma.outreachSequence.findUnique({ where: { emailAccountId_threadId: { emailAccountId, threadId: gmailThreadId } }, select: { id: true } });
    if (existing) return { gmailThreadId, ok: false, error: "Already tracked" };

    const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: emailAccountId }, select: { email: true } });
    const me = account.email.toLowerCase();
    const gmail = await gmailClientFor(emailAccountId);
    const allMessages = (await getThreadFullText(gmail, gmailThreadId)) as Msg[];
    const messages = allMessages.filter((m) => !isTrackingNotification(parseFromHeader(m.from).address));
    const fromMe = (m: Msg) => parseFromHeader(m.from).address.toLowerCase() === me;
    const theirs = messages.filter((m) => !fromMe(m));
    if (!messages.length || !fromMe(messages[0]) || !theirs.length) return { gmailThreadId, ok: false, error: "No reply from the creator in this thread" };

    const first = messages[0];
    const latest = theirs[theirs.length - 1];
    const sender = parseFromHeader(latest.from);
    const email = sender.address.toLowerCase();
    const ours = messages.filter(fromMe).map((m) => m.text);
    // The full reader (AI when a key is configured, rules otherwise) — same one the worker uses.
    const analysis = await analyzeThread(theirs, ours);

    const channelUrl = sel.channelUrl?.trim() || channelUrlIn([...theirs.map((m) => m.text), ...ours]);
    let creator = await matchCreator(email, channelUrl, sel.creatorName || creatorNameFromPitch(first.subject, first.text));
    let created = false;
    if (!creator) {
      const channelId = channelUrl ? await resolveChannelId(channelUrl).catch(() => null) : null;
      const byChannel = channelId ? await prisma.creator.findUnique({ where: { channelId }, select: { id: true, name: true, channelName: true, quotedRateAt: true } }) : null;
      if (byChannel) {
        creator = byChannel;
      } else {
        const name = sel.creatorName.trim() || sender.name || email;
        const row = await prisma.creator.create({
          data: {
            name,
            channelName: name,
            email,
            emailSource: "Gmail reply",
            channelId,
            channelUrl: channelId ? (channelUrl ?? `https://www.youtube.com/channel/${channelId}`) : (channelUrl ?? null),
            discoverySource: "gmail",
          },
          select: { id: true, name: true, channelName: true, quotedRateAt: true },
        });
        created = true;
        creator = row;
        if (channelId) await refreshCreator(row.id).catch(() => undefined);
      }
    }

    const contact =
      (await prisma.contact.findFirst({ where: { email, creatorId: creator.id }, select: { id: true } })) ??
      (await prisma.contact.create({ data: { creatorId: creator.id, name: sender.name || email, email }, select: { id: true } }));

    const stage = STAGE_FOR[analysis.intent] ?? "FIRST_EMAIL_SENT";
    const rates = mergeRates([], analysis.rates);
    const primary = primaryRate(rates);
    const replyAt = toDate(latest.date);
    const needsAnswer = stage === "RATE_RECEIVED" || stage === "INTERESTED";
    // Whoever wrote last: if it's us, the creator's reply has already been answered.
    const answered = fromMe(messages[messages.length - 1]);

    const sequence = await prisma.outreachSequence.create({
      data: {
        outreachType: "CREATOR",
        recipientType: "DIRECT",
        contactId: contact.id,
        emailAccountId,
        threadId: gmailThreadId,
        initialMessageId: first.id,
        currentStep: 0,
        status: analysis.intent === "OPT_OUT" ? "UNSUBSCRIBED" : "REPLIED",
        stage,
        // The worker counts every message in the thread, tracking pings included.
        lastKnownMsgCount: allMessages.length,
        variables: { Contact_Name: sender.name || email, Creator_Name: creator.channelName ?? creator.name },
        lastReplyAt: replyAt,
        lastReplyText: latest.text.slice(0, 4000) || null,
        replyIntent: analysis.intent,
        replySummary: analysis.summary,
        repliedAfterStep: 0,
        awaitingResponseSince: needsAnswer && !answered ? replyAt : null,
        ...(rates.length
          ? { quotedRates: rates as object, quotedRateAmount: primary?.amount ?? null, quotedRateCurrency: primary?.currency ?? null, quotedRateAt: replyAt }
          : analysis.intent === "RATE_SHARED" && analysis.rateNote
            ? { rateNote: analysis.rateNote }
            : {}),
        createdAt: toDate(first.date),
      },
    });

    await prisma.emailMessage.create({
      data: {
        sequenceId: sequence.id,
        providerMessageId: first.id,
        direction: "OUT",
        source: "MANUAL",
        subject: first.subject,
        body: first.text.slice(0, 4000) || "(sent directly from Gmail)",
        sentAt: toDate(first.date),
        status: "SENT",
      },
    });

    const rateText = rates.length ? rates.map((r) => formatRate(r)).join(", ") : null;
    const summary =
      stage === "RATE_RECEIVED"
        ? rateText
          ? `Rate: ${rateText}`
          : "Shared pricing (rate card or media kit) — open the email to see it"
        : stage === "INTERESTED"
          ? "Interested — no rate yet"
          : stage === "NOT_INTERESTED"
            ? analysis.intent === "OPT_OUT"
              ? "Asked not to be contacted"
              : "Declined"
            : "Replied";
    await prisma.activityLog.create({
      data: { sequenceId: sequence.id, eventType: "SEQUENCE_CREATED", description: `Imported from Gmail — conversation started ${toDate(first.date).toDateString()}. ${summary}. No follow-ups scheduled.` },
    });

    if (analysis.intent === "OPT_OUT") {
      await prisma.suppressedContact.upsert({ where: { email }, update: {}, create: { email, reason: "Replied asking not to be contacted" } });
    }
    // Same profile updates the worker makes on a reply: rate onto the roster row, media kit queued.
    if (rates.length && !creator.quotedRateAt) await syncCreatorRateFromSequence(sequence.id);
    if (analysis.intent !== "OPT_OUT" && analysis.intent !== "UNINTERESTED") await requestCreatorMediaKit(sequence.id).catch(() => undefined);

    return { gmailThreadId, ok: true, creatorId: creator.id, created, stage, summary };
  } catch (err) {
    return { gmailThreadId, ok: false, error: err instanceof Error ? err.message : "Couldn't import this conversation" };
  }
}
