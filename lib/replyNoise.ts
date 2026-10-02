/**
 * Mail that lands in a conversation without being an answer. Pure and dependency-free.
 *
 * Gmail's emoji reactions arrive as real emails ("👌 Sherry reacted via Gmail", in whatever language
 * the sender's Gmail is set to) that link back to Gmail with a tell-tale campaign tag. Read as a
 * reply, one flagged the thread as needing an answer and replaced the brand's actual reply text with
 * the reaction notice. A thumbs-up needs no answer.
 */
const REACTION_MARKERS = [/utm_campaign=emojireactionemail/i, /\breacted via Gmail\b/i, /已通过\s*Gmail/, /通过\s*Gmail\s*做出了回应/];

export function isGmailReaction(text: string | null | undefined): boolean {
  if (!text) return false;
  return REACTION_MARKERS.some((p) => p.test(text));
}

/** A snippet short enough to be a reaction notice and mentioning Gmail — worth reading the body to
 * check for the campaign tag, which localized notices carry even when their wording isn't known. */
export function mightBeGmailReaction(snippet: string): boolean {
  return snippet.length <= 200 && /gmail/i.test(snippet);
}
