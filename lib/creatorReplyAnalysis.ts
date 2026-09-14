/**
 * Reads an influencer's reply to paid-collaboration outreach: what they meant (a rate, interest, a
 * decline, an opt-out, "let me get back to you") and any rate they quoted.
 *
 * Deliberately separate from the brand classifier (replyClassifierHeuristic.ts). A brand reply is
 * read in terms of the creator list; an influencer reply is read in terms of the rate the outreach
 * asked for. The expensive mistake differs too: nudging a creator who already quoted a rate reads as
 * not having read their email. So an ambiguous reply falls back to handing the thread to the team
 * (HUMAN_REPLY) — never to "keep following up", which is what the brand heuristic does with short
 * replies.
 *
 * Pure and dependency-free: it's the zero-API-key default and the tested floor under the optional
 * AI layer in creatorReplyAI.ts.
 */

export const CREATOR_REPLY_INTENTS = [
  "RATE_SHARED",
  "INTERESTED",
  "NON_COMMITTAL",
  "UNINTERESTED",
  "OPT_OUT",
  "AUTO_REPLY",
  "HUMAN_REPLY",
] as const;

export type CreatorReplyIntent = (typeof CREATOR_REPLY_INTENTS)[number];

export interface QuotedRate {
  amount: number;
  /** Upper end when a range was quoted ("$800–$1,200"), otherwise null. */
  amountMax: number | null;
  /** ISO 4217 code, or null when the reply gave a number without a currency. Never assumed. */
  currency: string | null;
  /** What the rate is for ("Dedicated video", "Integration"…), or null when the reply doesn't say. */
  deliverable: string | null;
  /** The exact text the amount was read from, kept as evidence next to the number. */
  raw: string;
  source: "reply" | "manual";
}

export interface CreatorReplyAnalysis {
  intent: CreatorReplyIntent;
  rates: QuotedRate[];
  /** Set when pricing was shared in a form this can't read, e.g. an attached rate card. */
  rateNote: string | null;
  /** One-line summary — only the AI layer writes one. */
  summary: string | null;
}

// --- Rate extraction -----------------------------------------------------------------------------

const CURRENCY_BY_TOKEN: Record<string, string> = {
  us$: "USD",
  $: "USD",
  c$: "CAD",
  ca$: "CAD",
  a$: "AUD",
  au$: "AUD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  inr: "INR",
  cad: "CAD",
  aud: "AUD",
  rs: "INR",
  "rs.": "INR",
  dollar: "USD",
  dollars: "USD",
  bucks: "USD",
  euro: "EUR",
  euros: "EUR",
  pounds: "GBP",
  rupees: "INR",
};

const SYMBOLS = String.raw`US\$|CA\$|AU\$|C\$|A\$|\$|€|£|₹`;
const CODES = "USD|EUR|GBP|INR|CAD|AUD";
// A whole number token — the lookahead stops a regex backtracking "800 views" down to "80".
const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?!\d|[.,]\d)(\s?[kK](?![A-Za-z]))?`;
const RANGE = String.raw`\s*(?:-|–|—|to)\s*`;

const PREFIX_RE = new RegExp(
  `(${SYMBOLS}|\\b(?:${CODES}|Rs\\.?)(?=\\s?\\d))\\s?${NUM}(?:${RANGE}(?:${SYMBOLS}|${CODES})?\\s?${NUM})?`,
  "gi"
);
const SUFFIX_RE = new RegExp(
  `(?<![\\w.,$€£₹])${NUM}(?:${RANGE}${NUM})?\\s?(${SYMBOLS}|${CODES}|dollars?|bucks|euros?|pounds|rupees)(?![A-Za-z])`,
  "gi"
);
// A bare number right after pricing language ("my rate is 800") — only trusted when it isn't a
// subscriber/view/duration count, and never given a currency the reply didn't state.
const KEYWORD_RE = new RegExp(
  `(\\b(?:rates?|charges?|charging|fees?|price|pricing|costs?|quote|asking)\\b[^.\\n\\d$€£₹]{0,30}?)(?<![\\w.,])${NUM}` +
    String.raw`(?!\s?(?:%|\+|k?\s?subs|subscribers|views|followers|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|years?|videos?|shorts?|posts?|reels?|integrations?))`,
  "gi"
);

const DELIVERABLE_PATTERNS: [RegExp, string][] = [
  [/\bdedicated\b|\bfull[- ](?:video|review)\b|\bstandalone\b/i, "Dedicated video"],
  [/\bintegrat|\bmention\b|\bshout.?out\b|\bsegment\b|\bad[- ]read\b|\bpre-?roll\b/i, "Integration"],
  [/\bshorts?\b|\breels?\b|\btik\s?tok\b/i, "Short-form"],
  [/\binstagram\b|\bstor(?:y|ies)\b/i, "Instagram"],
  [/\bpackage\b|\bbundle\b|\bcombo\b/i, "Package"],
];

function parseAmount(num: string | undefined, k: string | undefined): number | null {
  if (!num) return null;
  const value = parseFloat(num.replace(/,/g, "")) * (k ? 1000 : 1);
  return Number.isFinite(value) ? value : null;
}

function currencyFor(token: string | undefined): string | null {
  if (!token) return null;
  return CURRENCY_BY_TOKEN[token.toLowerCase().replace(/\s+/g, "")] ?? null;
}

function deliverableIn(text: string): string | null {
  for (const [pattern, label] of DELIVERABLE_PATTERNS) if (pattern.test(text)) return label;
  return null;
}

interface RawMatch {
  start: number;
  end: number;
  amount: number;
  amountMax: number | null;
  currency: string | null;
  raw: string;
}

const MIN_PLAUSIBLE_RATE = 20;
const MAX_PLAUSIBLE_RATE = 5_000_000;

function toMatch(start: number, raw: string, amount: number | null, amountMax: number | null, currency: string | null): RawMatch | null {
  if (amount === null || amount < MIN_PLAUSIBLE_RATE || amount > MAX_PLAUSIBLE_RATE) return null;
  return {
    start,
    end: start + raw.length,
    amount,
    amountMax: amountMax !== null && amountMax > amount ? amountMax : null,
    currency,
    raw: raw.trim(),
  };
}

/** Every price the reply states, in reading order, each tagged with what it's for when that's said. */
export function extractQuotedRates(text: string): QuotedRate[] {
  const matches: RawMatch[] = [];
  const overlaps = (start: number, end: number) => matches.some((m) => start < m.end && end > m.start);

  for (const m of text.matchAll(PREFIX_RE)) {
    const match = toMatch(m.index!, m[0], parseAmount(m[2], m[3]), parseAmount(m[4], m[5]), currencyFor(m[1]));
    if (match) matches.push(match);
  }
  for (const m of text.matchAll(SUFFIX_RE)) {
    if (overlaps(m.index!, m.index! + m[0].length)) continue;
    const match = toMatch(m.index!, m[0], parseAmount(m[1], m[2]), parseAmount(m[3], m[4]), currencyFor(m[5]));
    if (match) matches.push(match);
  }
  for (const m of text.matchAll(KEYWORD_RE)) {
    const start = m.index! + m[1].length;
    const raw = m[0].slice(m[1].length);
    if (overlaps(start, start + raw.length)) continue;
    const amount = parseAmount(m[2], m[3]);
    // A year ("my rates for 2027") is a number after pricing language too.
    if (amount !== null && !m[3] && amount >= 1990 && amount <= 2100 && Number.isInteger(amount)) continue;
    const match = toMatch(start, raw, amount, null, null);
    if (match) matches.push(match);
  }

  matches.sort((a, b) => a.start - b.start);

  const rates: QuotedRate[] = [];
  matches.forEach((m, i) => {
    const prevEnd = i > 0 ? matches[i - 1].end : 0;
    const nextStart = i < matches.length - 1 ? matches[i + 1].start : text.length;
    const before = text.slice(Math.max(prevEnd, m.start - 50), m.start);
    const after = text.slice(m.end, Math.min(nextStart, m.end + 40));
    // "$900 for a dedicated video" names the deliverable after the price; "Dedicated: $900" names
    // it before. Reading the wrong side mislabels the second price in "…dedicated and $500 for X".
    const deliverable = /^\s*(?:for|per|\/)/i.test(after)
      ? (deliverableIn(after) ?? deliverableIn(before))
      : (deliverableIn(before) ?? deliverableIn(after.split(/[.\n]/)[0]));
    const duplicate = rates.some((r) => r.amount === m.amount && r.currency === m.currency && r.deliverable === deliverable);
    if (!duplicate) {
      rates.push({ amount: m.amount, amountMax: m.amountMax, currency: m.currency, deliverable, raw: m.raw, source: "reply" });
    }
  });
  return rates;
}

/** Every amount written in the text, however it's formatted — used to verify AI-reported rates. */
export function amountsInText(text: string): number[] {
  const any = new RegExp(`(?<![\\w.,])${NUM}`, "g");
  const amounts: number[] = [];
  for (const m of text.matchAll(any)) {
    const value = parseAmount(m[1], m[2]);
    if (value !== null) amounts.push(value);
  }
  return amounts;
}

/** ISO codes for every currency the text signals, by symbol or by name. */
export function currenciesInText(text: string): Set<string> {
  const found = new Set<string>();
  const tokens = new RegExp(`(${SYMBOLS})|\\b(${CODES}|Rs\\.?|dollars?|bucks|euros?|pounds|rupees)\\b`, "gi");
  for (const m of text.matchAll(tokens)) {
    const code = currencyFor(m[1] ?? m[2]);
    if (code) found.add(code);
  }
  return found;
}

/** The rate to headline: the dedicated-video price the outreach asks for, else the first one quoted. */
export function primaryRate(rates: QuotedRate[]): QuotedRate | null {
  return rates.find((r) => r.deliverable === "Dedicated video") ?? rates[0] ?? null;
}

/** A later reply updates the price for what it mentions and keeps earlier prices for everything else. */
export function mergeRates(existing: QuotedRate[], incoming: QuotedRate[]): QuotedRate[] {
  const key = (r: QuotedRate) => r.deliverable ?? "_unspecified";
  const replaced = new Set(incoming.map(key));
  return [...incoming, ...existing.filter((r) => !replaced.has(key(r)))];
}

/** Reads the stored JSON column back defensively — it's written by this module, but it's still JSON. */
export function parseStoredRates(value: unknown): QuotedRate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    if (typeof o.amount !== "number" || !Number.isFinite(o.amount)) return [];
    return [
      {
        amount: o.amount,
        amountMax: typeof o.amountMax === "number" ? o.amountMax : null,
        currency: typeof o.currency === "string" ? o.currency : null,
        deliverable: typeof o.deliverable === "string" ? o.deliverable : null,
        raw: typeof o.raw === "string" ? o.raw : "",
        source: o.source === "manual" ? "manual" : "reply",
      },
    ];
  });
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹", CAD: "CA$", AUD: "A$" };

export function formatMoney(amount: number, currency: string | null): string {
  const number = amount.toLocaleString("en-US", { maximumFractionDigits: amount % 1 === 0 ? 0 : 2 });
  if (!currency) return number;
  const symbol = CURRENCY_SYMBOL[currency];
  return symbol ? `${symbol}${number}` : `${number} ${currency}`;
}

/** "$800–$1,200 · Dedicated video" — and says so plainly when no currency was given. */
export function formatRate(rate: Pick<QuotedRate, "amount" | "amountMax" | "currency" | "deliverable">, withDeliverable = true): string {
  const money =
    rate.amountMax !== null
      ? `${formatMoney(rate.amount, rate.currency)}–${formatMoney(rate.amountMax, rate.currency)}`
      : formatMoney(rate.amount, rate.currency);
  const currencyNote = rate.currency ? "" : " (no currency given)";
  return `${money}${currencyNote}${withDeliverable && rate.deliverable ? ` · ${rate.deliverable}` : ""}`;
}

// --- Intent --------------------------------------------------------------------------------------

const OPT_OUT_PATTERNS = [
  /\bstop\s+(?:emailing|contacting|messaging)\s+(?:me|us)\b/i,
  /\b(?:remove|take)\s+(?:me|us)\s+(?:off|from)\s+(?:your|the|this)\s+(?:mailing\s+)?list\b/i,
  /\bunsubscribe\b/i,
  /\bdo\s+not\s+(?:email|contact)\s+(?:me|us)\b/i,
  /\bno\s+longer\s+(?:wish|want)\s+to\s+(?:receive|be\s+contacted)\b/i,
  /\bplease\s+don'?t\s+(?:email|contact|reach\s+out\s+to)\s+(?:me|us)\b/i,
];

const AUTO_REPLY_PATTERNS = [
  /\bout\s+of\s+(?:the\s+)?office\b/i,
  /\bautomatic\s+reply\b/i,
  /\bauto-?reply\b/i,
  /\bon\s+(?:vacation|holiday|leave)\s+until\b/i,
  /\bthis\s+(?:mailbox|inbox)\s+is\s+not\s+monitored\b/i,
];

const RATE_CARD_PATTERN = /\b(?:rate\s*card|media\s*kit|rate\s*sheet|price\s*list|pricing\s*(?:sheet|deck|guide|pdf))\b/i;
const SHARED_PATTERN = /\battach|\benclosed\b|\bhere(?:'s|\s+is|\s+are)\b|\bbelow\b|https?:\/\//i;

const DECLINE_PATTERNS = [
  /\bnot\s+interested\b/i,
  /\b(?:not|isn'?t|aren'?t|doesn'?t\s+seem)\s+(?:a\s+)?(?:good\s+|great\s+|right\s+)?fit\b/i,
  /\b(?:i|we)(?:'ll|\s+will)\s+(?:have\s+to\s+)?pass\b/i,
  /\bpass(?:ing)?\s+on\s+(?:this|that)\b/i,
  /\bno\s+thank(?:s|\s+you)\b/i,
  /\b(?:fully|completely)\s+booked\b/i,
  /\b(?:don'?t|do\s+not|no\s+longer|not)\s+(?:currently\s+)?(?:do|doing|take|taking|accept|accepting|work(?:ing)?\s+with|open\s+to)\s+(?:any\s+|on\s+)?(?:new\s+)?(?:sponsor(?:ship)?s?|sponsored|paid|brand|collab(?:oration)?s?|partnerships?|promotions?|ads?)\b/i,
  /\bnot\s+(?:taking|accepting)\s+(?:any|new|on)\b/i,
  /\b(?:i\s+)?(?:have\s+to\s+|must\s+)?decline\b/i,
  /\bnot\s+for\s+me\b/i,
  /\bnot\s+(?:right\s+)?now\b/i,
];

const INTEREST_PATTERNS = [
  /\binterested\b/i,
  /\bopen\s+to\b/i,
  /\b(?:would|i'?d)\s+love\s+to\b/i,
  /\b(?:happy|glad|excited)\s+to\b/i,
  /\bsounds?\s+(?:good|great|interesting|exciting|awesome|fun|amazing)\b/i,
  /\b(?:yes|yeah|yep|absolutely|definitely|of\s+course)\b/i,
  /(?<!\bnot\s)(?<!\bnot\s\s)\bsure\b/i,
  /\b(?:count\s+me\s+in|let'?s\s+do\s+(?:it|this)|i'?m\s+in)\b/i,
  /\bwhat(?:'s|\s+is|\s+are)\s+(?:the\s+)?(?:brand|product|budget|timeline|deliverables?|compensation|pay)\b/i,
  /\b(?:which|what)\s+brand\b/i,
  /\b(?:send|share)\s+(?:me\s+|us\s+|over\s+)*(?:the\s+|more\s+|some\s+)?(?:brand\s+)?(?:details|info|information|brief|specifics)\b/i,
  /\btell\s+me\s+more\b/i,
  /\bmore\s+(?:details|info|information)\b/i,
  /\bwhat(?:'s|\s+is)\s+your\s+budget\b/i,
  /\bdepends\s+on\s+(?:the\s+)?(?:brand|product|scope|deliverables?)\b/i,
];

const NON_COMMITTAL_PATTERNS = [
  /\bget\s+back\s+to\s+you\b/i,
  /\blet\s+you\s+know\b/i,
  /\b(?:let\s+me|i'?ll|i\s+will|will)\s+(?:check|think|look\s+into|review|discuss|consider|circle\s+back)\b/i,
  /\bkeep\s+you\s+posted\b/i,
  /\bwill\s+revert\b/i,
  /\bthink\s+about\s+it\b/i,
  /\bnoted\b/i,
];

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeLine(line: string): string {
  return line.replace(/^\s*>+\s?/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Removes lines copied from our own emails. Gmail's quote-stripping catches the usual
 * "On … wrote:" chain, but a client that quotes without those markers would otherwise leave our
 * own "would you be open to a paid collaboration?" in the text — which reads as interest.
 */
export function stripOwnQuotedLines(text: string, sentBodies: string[]): string {
  const ours = new Set(
    sentBodies.flatMap((body) => body.split("\n").map(normalizeLine)).filter((line) => line.length >= 25)
  );
  if (ours.size === 0) return text;
  return text
    .split("\n")
    .filter((line) => !ours.has(normalizeLine(line)))
    .join("\n")
    .trim();
}

export function findEmailAddresses(text: string): string[] {
  const found = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

/** Rule-based read of a creator's reply. Checked strongest-signal-first; the first match wins. */
export function analyzeCreatorReplyHeuristic(rawText: string, sentBodies: string[] = []): CreatorReplyAnalysis {
  const text = stripOwnQuotedLines(rawText, sentBodies).trim();
  const result = (intent: CreatorReplyIntent, rates: QuotedRate[] = [], rateNote: string | null = null): CreatorReplyAnalysis => ({
    intent,
    rates,
    rateNote,
    summary: null,
  });

  if (!text) return result("HUMAN_REPLY");
  if (OPT_OUT_PATTERNS.some((p) => p.test(text))) return result("OPT_OUT");

  // A concrete price outranks everything below it: "not interested at $200, my rate is $900" is a
  // rate, and "out of office last week, sorry — $900 for a dedicated" is too.
  const rates = extractQuotedRates(text);
  if (rates.length > 0) return result("RATE_SHARED", rates);
  if (RATE_CARD_PATTERN.test(text) && SHARED_PATTERN.test(text)) {
    return result("RATE_SHARED", [], "Rate card or media kit shared — open the email to see their pricing.");
  }

  if (wordCount(text) <= 80 && AUTO_REPLY_PATTERNS.some((p) => p.test(text))) return result("AUTO_REPLY");
  if (DECLINE_PATTERNS.some((p) => p.test(text))) return result("UNINTERESTED");
  if (INTEREST_PATTERNS.some((p) => p.test(text))) return result("INTERESTED");
  if (NON_COMMITTAL_PATTERNS.some((p) => p.test(text))) return result("NON_COMMITTAL");

  return result("HUMAN_REPLY");
}
