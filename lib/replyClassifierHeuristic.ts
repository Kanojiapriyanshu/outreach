import type { ReplyClassification } from "./replyClassifier";

// Ordered strongest-signal-first — checked top to bottom, first match wins.

const OPT_OUT_PATTERNS = [
  /\bstop\s+(emailing|contacting|messaging)\s+(me|us)\b/i,
  /\b(remove|take)\s+(me|us)\s+(off|from)\s+(your|the)\s+list\b/i,
  /\bunsubscribe\b/i,
  /\bdo\s+not\s+(email|contact)\s+(me|us)\s+again\b/i,
  /\bno\s+longer\s+(wish|want)\s+to\s+(receive|be\s+contacted)\b/i,
  /\bplease\s+don'?t\s+(email|contact|reach\s+out\s+to)\s+(me|us)\s+again\b/i,
];

const UNINTERESTED_PATTERNS = [
  /\b(not|isn'?t|aren'?t|doesn'?t\s+seem)\s+(a\s+)?(good\s+)?fit\b/i,
  /\bnot\s+interested\b/i,
  /\bwe'?ll?\s+pass\b/i,
  /\bpassing\s+on\s+this\b/i,
  /\bnot\s+(right\s+)?now\b/i,
  /\bno\s+thank(s|\s+you)\b/i,
  /\bnot\s+looking\s+to\b/i,
  /\bdecided\s+not\s+to\b/i,
];

const WANTS_LIST_REQUEST_PATTERNS = [
  /\b(send|share|forward)\s+(over\s+)?(the\s+|us\s+|me\s+)?(creator|influencer)s?\s*(list|profiles|options|shortlist)?\b/i,
  /\bsend\s+(over\s+)?(the\s+)?(list|profiles|media\s*kit|options|shortlist)\b/i,
  /\bkindly\s+send\b/i,
  /\bshare\s+(the\s+)?(media\s*kit|profiles|creators)\b/i,
  /\bcan\s+you\s+send\b/i,
  /\bplease\s+send\b/i,
];
const WANTS_LIST_INTEREST_PATTERNS = [
  /\bsounds?\s+(good|great|exciting|interesting)\b/i,
  /\b(happy|glad)\s+to\b/i,
  /\bwe'?re\s+interested\b/i,
  /\byes\s*[,.!]/i,
  /\blet'?s\s+(do|move\s+forward)\b/i,
];

const CREATOR_CHOSEN_PATTERNS = [
  /\blet'?s\s+go\s+with\b/i,
  /\bwe'?ll\s+go\s+with\b/i,
  /\bgo\s+ahead\s+with\b/i,
  /\bproceed\s+with\b/i,
  /\bwe\s+(want|like|choose|pick|select|'d\s+like)\b.{0,40}\b(creator|this\s+one|these|him|her|them)\b/i,
  /\byes\s+to\s+(this|that|creator)/i,
  /\bwe'?ve\s+(chosen|selected|picked)\b/i,
];

const NON_COMMITTAL_PATTERNS = [
  /\bwe'?ll\s+see\b/i,
  /\bwill\s+get\s+back\s+to\s+you\b/i,
  /\bget\s+back\s+to\s+you\b/i,
  /\bwill\s+(check|review|take\s+a\s+look|discuss)\b/i,
  /\bwe'?ll\s+(check|review|discuss|circle\s+back|follow\s+up)\b/i,
  /\blet\s+you\s+know\b/i,
  /\bkeep\s+you\s+posted\b/i,
  /\bnoted\b/i,
  /\breceived,?\s*thanks\b/i,
  /\bwill\s+revert\b/i,
  /\bwill\s+update\s+you\b/i,
  /\bwe'?ll\s+understand\b/i,
];

/**
 * Zero-cost, no-API-key reply classifier — regex/keyword based, same philosophy as
 * emailExtractorHeuristic.ts. This is the DEFAULT classifier; classifyReply() in
 * replyClassifier.ts only reaches for the paid LLM when ANTHROPIC_API_KEY is configured, and
 * even then falls back to this on any API error. Order matters — checked strongest-signal-first.
 */
export function classifyReplyHeuristic(
  snippet: string,
  context: { creatorListAlreadySent: boolean }
): ReplyClassification {
  const text = snippet.trim();
  if (!text) return "HUMAN_REPLY";

  if (OPT_OUT_PATTERNS.some((p) => p.test(text))) return "OPT_OUT";
  if (UNINTERESTED_PATTERNS.some((p) => p.test(text))) return "UNINTERESTED";

  if (context.creatorListAlreadySent) {
    if (CREATOR_CHOSEN_PATTERNS.some((p) => p.test(text))) return "CREATOR_CHOSEN";
  } else {
    const hasRequest = WANTS_LIST_REQUEST_PATTERNS.some((p) => p.test(text));
    const hasInterest = WANTS_LIST_INTEREST_PATTERNS.some((p) => p.test(text));
    // A bare "sounds good" alone is too weak (could mean anything); require either an explicit
    // request, or interest language paired with a request-like word ("send"/"list"/"creator").
    if (hasRequest || (hasInterest && /\b(send|list|creator|profile|media\s*kit)/i.test(text))) {
      return "WANTS_CREATOR_LIST";
    }
  }

  if (NON_COMMITTAL_PATTERNS.some((p) => p.test(text))) return "NON_COMMITTAL";

  // A short reply with no other signal reads as a non-answer far more often than a real one —
  // "Ok, will see" / "Sure, let's talk" style one-liners without any of the above phrasing.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 6) return "NON_COMMITTAL";

  return "HUMAN_REPLY";
}
